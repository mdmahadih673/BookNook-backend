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

app.post("/my-borrows", async (req, res) => {
    const { _id, bookId: requestedBookId, borrowerEmail } = req.body;
    const bookId = requestedBookId || _id;

    if (!ObjectId.isValid(bookId) || !borrowerEmail) {
        return res.status(400).send({ message: 'A valid book and borrower email are required.' });
    }

    const alreadyBorrowed = await myCollection.findOne({ borrowerEmail });
    if (alreadyBorrowed) {
        return res.status(409).send({ message: 'You already have a borrowed book.' });
    }

    const book = await BookNookCollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) {
        return res.status(404).send({ message: 'Book not found.' });
    }

    const availableCopies = Number(book.availableCopies);
    if (!Number.isFinite(availableCopies) || availableCopies < 1) {
        return res.status(409).send({ message: 'No copies of this book are available.' });
    }

    const stockUpdate = await BookNookCollection.updateOne(
        { _id: book._id, availableCopies: book.availableCopies },
        { $set: { availableCopies: availableCopies - 1 } },
    );
    if (stockUpdate.modifiedCount !== 1) {
        return res.status(409).send({ message: 'Book quantity changed. Please try again.' });
    }

    const bookData = { ...req.body, bookId };
    delete bookData._id;
    try {
        const result = await myCollection.insertOne({ ...bookData, bookId });
        return res.send(result);
    } catch (error) {
        await BookNookCollection.updateOne(
            { _id: new ObjectId(bookId) },
            { $inc: { availableCopies: 1 } },
        );
        throw error;
    }

});

app.delete("/my-borrows/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).send({ message: 'Invalid borrow ID.' });
    }

    const borrowId = new ObjectId(req.params.id);
    const borrowedBook = await myCollection.findOne({ _id: borrowId });
    if (!borrowedBook) {
        return res.status(404).send({ message: 'Borrowed book not found.' });
    }

    const bookId = borrowedBook.bookId || borrowedBook._id;
    if (!ObjectId.isValid(bookId)) {
        return res.status(400).send({ message: 'Invalid book ID.' });
    }

    const book = await BookNookCollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) {
        return res.status(404).send({ message: 'Book not found.' });
    }

    const availableCopies = Number(book.availableCopies);
    if (!Number.isFinite(availableCopies)) {
        return res.status(500).send({ message: 'Book quantity is invalid.' });
    }

    const stockUpdate = await BookNookCollection.updateOne(
        { _id: book._id, availableCopies: book.availableCopies },
        { $set: { availableCopies: availableCopies + 1 } },
    );
    if (stockUpdate.modifiedCount !== 1) {
        return res.status(409).send({ message: 'Book quantity changed. Please try again.' });
    }

    const deleted = await myCollection.deleteOne({ _id: borrowId });
    if (!deleted.deletedCount) {
        await BookNookCollection.updateOne(
            { _id: book._id },
            { $inc: { availableCopies: -1 } },
        );
        return res.status(404).send({ message: 'Borrowed book not found.' });
    }

    return res.send({ message: 'Book returned successfully.' });
});


app.post("/books", async (req, res) => {

    const bookData = req.body;
    const result = await BookNookCollection.insertOne(bookData);

    res.send(result)
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
