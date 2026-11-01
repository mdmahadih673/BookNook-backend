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

await myCollection.createIndex(
    { borrowerEmail: 1 },
    {
        unique: true,
        partialFilterExpression: { active: true },
        name: 'one_active_borrow_per_account',
    },
)

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
    const { bookId, borrowerName, borrowerEmail, borrowerImage } = req.body;
    if (!ObjectId.isValid(bookId) || !borrowerEmail) {
        return res.status(400).json({ error: 'A valid book and borrower email are required.' });
    }

    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            const existingBorrow = await myCollection.findOne(
                {
                    borrowerEmail,
                    $or: [{ active: true }, { active: { $exists: false } }],
                },
                { session },
            );
            if (existingBorrow) {
                throw Object.assign(new Error('You can borrow only one book at a time.'), {
                    status: 409,
                    code: 'account_borrow_limit',
                });
            }

            const bookObjectId = new ObjectId(bookId);
            const book = await BookNookCollection.findOne(
                { _id: bookObjectId },
                { session },
            );
            if (!book) {
                throw Object.assign(new Error('This book could not be found.'), { status: 404 });
            }

            const stockUpdate = await BookNookCollection.updateOne(
                { _id: bookObjectId, availableCopies: { $gt: 0 } },
                { $inc: { availableCopies: -1 } },
                { session },
            );
            if (stockUpdate.modifiedCount !== 1) {
                throw Object.assign(new Error('There are no available copies of this book.'), {
                    status: 409,
                    code: 'book_unavailable',
                });
            }

            await myCollection.insertOne({
                bookId: bookObjectId.toString(),
                title: book.title,
                author: book.author,
                category: book.category,
                image: book.image,
                borrowerName,
                borrowerEmail,
                borrowerImage,
                active: true,
            }, { session });
        });

        return res.status(201).json({ message: 'Book borrowed successfully.' });
    } catch (error) {
        console.error('Borrow request failed:', error);
        return res.status(error.status || 500).json({
            code: error.code || 'server_error',
            error: error.message,
        });
    } finally {
        await session.endSession();
    }
});

app.delete("/my-borrows/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid borrow ID.' });
    }

    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            const borrowId = new ObjectId(req.params.id);
            const borrowRecord = await myCollection.findOne(
                { _id: borrowId },
                { session },
            );
            if (!borrowRecord) throw Object.assign(new Error('Borrow not found.'), { status: 404 });

            const bookId = borrowRecord.bookId ?? borrowRecord._id.toString();
            if (!ObjectId.isValid(bookId)) throw new Error('Invalid book ID.');

            const stockUpdate = await BookNookCollection.updateOne(
                { _id: new ObjectId(bookId) },
                { $inc: { availableCopies: 1 } },
                { session },
            );
            if (stockUpdate.modifiedCount !== 1) throw Object.assign(new Error('Book not found.'), { status: 404 });

            await myCollection.deleteOne({ _id: borrowId }, { session });
        });

        return res.json({ message: 'Book returned successfully.' });
    } catch (error) {
        console.error('Return request failed:', error);
        return res.status(error.status || 500).json({ error: error.message });
    } finally {
        await session.endSession();
    }
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
