import { MongoClient, ObjectId } from 'mongodb';
import express from 'express'
import 'dotenv/config'
import cors from 'cors'



const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

const mongodbClirnt = await connectToMongoDB()

const db = mongodbClirnt.db('BookNook')
const BookNookCollection = db.collection('Books')
const myCollection = db.collection('myBooks')

app.get('/books', async (req, res) => {
    const books = BookNookCollection.find({})
    const allBooks = await books.toArray()
    res.send(allBooks)
})

app.get('/books/:id', async (req, res) => {
    const { id } = req.params;
    const result = await BookNookCollection.findOne({ _id: new ObjectId(id) })
    res.send(result)
})

app.post("/books", async (req, res) => {
  try {
    const bookData = req.body;
    const result = await BookNookCollection.insertOne(bookData);

    res.status(201).json({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add book" });
  }
});


app.post("/my-borrows", async (req, res) => {
  try {
    const borrowData = req.body;
    if (!borrowData.bookId || !borrowData.borrowerEmail) {
      return res.status(400).json({ message: "Book ID and borrower email are required." });
    }

    const existingBorrow = await myCollection.findOne({
      bookId: borrowData.bookId,
      borrowerEmail: borrowData.borrowerEmail,
    });
    if (existingBorrow) {
      return res.status(409).json({ message: "This book is already in your borrows." });
    }

    const result = await myCollection.insertOne({
      ...borrowData,
      borrowedAt: new Date(),
    });

    res.status(201).json({
      message: "Book added to My Borrows successfully.",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add book to My Borrows." });
  }
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


export default app
