import { MongoClient, ObjectId } from 'mongodb';
import express from 'express'
import 'dotenv/config'
import cors from 'cors'



const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));



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


await BookNookCollection.updateMany(
    { $or: [{ totalCopies: { $type: 'string' } }, { availableCopies: { $type: 'string' } }] },
    [{
        $set: {
            totalCopies: { $convert: { input: '$totalCopies', to: 'int', onError: 0 } },
            availableCopies: { $convert: { input: '$availableCopies', to: 'int', onError: 0 } },
        },
    }]
);

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

const LOAN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

app.post("/my-borrows", async (req, res) => {
    try {
        const bookData = { ...req.body };
        delete bookData._id;


        if (bookData.bookId) {


            const stock = await BookNookCollection.updateOne(
                { _id: new ObjectId(bookData.bookId), availableCopies: { $gt: 0 }, totalCopies: { $gt: 0 } },
                { $inc: { availableCopies: -1 } }
            );
            if (stock.matchedCount === 0) {
                return res.status(409).send({ message: "No copies are available for this book." });
            }
        }

        if (!bookData.borrowedAt) bookData.borrowedAt = new Date();
        bookData.dueAt = new Date(new Date(bookData.borrowedAt).getTime() + LOAN_DAYS * DAY_MS);

        const result = await myCollection.insertOne(bookData);
        res.send(result);
    } catch (err) {
        console.error("POST /my-borrows failed:", err);
        res.status(500).send({ message: err.message });
    }
});

app.delete("/my/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const record = await myCollection.findOne({ _id: new ObjectId(id) });
        if (!record) {
            return res.status(404).send({ message: "Borrow record not found" });
        }



        if (record.bookId) {
            await BookNookCollection.updateOne(

                { _id: new ObjectId(record.bookId) },
                { $inc: { availableCopies: 1 } }
            );
        }

        await myCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: true });
    } catch (err) {

        console.error("DELETE /my/:id failed:", err);
        res.status(500).send({ message: err.message });
    }
});

app.post("/books", async (req, res) => {
    try {
        const bookData = {
            ...req.body,
            totalCopies: Number(req.body?.totalCopies) || 0,
            availableCopies: Number(req.body?.availableCopies) || 0,
        };


        const result = await BookNookCollection.insertOne(bookData);
        res.send(result);
    } catch (err) {
        
        console.error("POST /books failed:", err);
        res.status(500).send({ message: err.message });
    }
});

app.get("/my/:email", async (req, res) => {
    const { email } = req.params;
    const result = await myCollection
        .find({ borrowerEmail: email })
        .toArray();

    res.send(result);
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


export default app
