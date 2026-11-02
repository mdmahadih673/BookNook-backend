import { MongoClient, ObjectId } from 'mongodb';
import express from 'express'
import 'dotenv/config'
import cors from 'cors'
import { jwtVerify, createRemoteJWKSet } from 'jose'


const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));



const client = new MongoClient(process.env.MONGODB_URL);
const authBaseURL = process.env.BETTER_AUTH_URL ;
const JWKS = createRemoteJWKSet(new URL('/api/auth/jwks', authBaseURL));

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


const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null;
    if (!token) return res.status(401).send({ message: "Unauthorized access" });

    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: authBaseURL,
            audience: authBaseURL,
        });
        if (!payload.email || (!payload.id && !payload.sub)) {
            return res.status(401).send({ message: "Token is missing user identity." });
        }
        req.user = {
            id: String(payload.id || payload.sub),
            email: String(payload.email),
            name: String(payload.name || ''),
            image: String(payload.image || ''),
        };
        next();
    } catch (error) {
        return res.status(401).send({ message: "Invalid or expired token." });
    }
}

const ownerFilter = (user) => ({
    $or: [
        { ownerId: user.id },
        { ownerId: { $exists: false }, userEmail: user.email },
    ],
});

const verifyMyBooks = (req, res, next) =>
    req.query.mine === "true" ? verifyToken(req, res, next) : next();

app.get('/books', verifyMyBooks, async (req, res) => {
    const filter = req.query.mine === "true" ? ownerFilter(req.user) : {};
    const booksQuery = BookNookCollection.find(filter);

    if (req.query.mine === "true" || req.query.limit) {
        booksQuery.sort({ addedDate: -1 });
    }
    if (req.query.limit) {
        booksQuery.limit(Math.min(Number(req.query.limit) || 6, 6));
    }

    const books = await booksQuery.toArray();
    res.send(books)
})


// GET http://localhost:5000/books/:id → 1 ta book er detail pbe
app.get('/books/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const result = await BookNookCollection.findOne({ _id: new ObjectId(id) })
    res.send(result)
})



const LOAN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// POST /borrows → borrow a book
app.post("/borrows", verifyToken, async (req, res) => {
    const { _id, ...borrow } = req.body;

    const alreadyBorrowed = await myCollection.findOne({
        bookId: borrow.bookId || String(_id),
        borrowerEmail: req.user.email,
    });
    if (alreadyBorrowed) {
        return res.status(409).send({ message: "You have already borrowed this book." });
    }

    const stock = await BookNookCollection.updateOne(
        { _id: new ObjectId(_id), availableCopies: { $gt: 0 }, totalCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } }
    );
    if (stock.matchedCount === 0) {
        return res.status(409).send({ message: "No copies are available for this book." })
    }

    const result = await myCollection.insertOne({
        ...borrow,
        bookId: borrow.bookId || String(_id),
        borrowerName: req.user.name,
        borrowerEmail: req.user.email,
        borrowerImage: req.user.image,
        borrowedAt: new Date(),
        dueAt: new Date(Date.now() + LOAN_DAYS * DAY_MS),
    })
    res.send(result)
})



// DELETE /borrows/:id → return a borrowed book
app.delete("/borrows/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    const record = await myCollection.findOne({ _id: new ObjectId(id), borrowerEmail: req.user.email })
    if (!record) {
        return res.status(404).send({ message: "Borrow record not found." });
    }

    if (record.bookId) {
        await BookNookCollection.updateOne(
            { _id: new ObjectId(record.bookId) },
            { $inc: { availableCopies: 1 } }
        )
    }

    await myCollection.deleteOne({ _id: new ObjectId(id) });
    res.send({ success: true });
})



// POST /books → add a book
app.post("/books", verifyToken, async (req, res) => {
    const bookData = {
        ...req.body,
        ownerId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        totalCopies: Number(req.body?.totalCopies) || 0,
        availableCopies: Number(req.body?.availableCopies) || 0,
    };

    const result = await BookNookCollection.insertOne(bookData);
    res.send(result);
});



// GET /borrows → get the signed-in user's borrowed books
app.get("/borrows", verifyToken, async (req, res) => {
    const result = await myCollection
        .find({ borrowerEmail: req.user.email })
        .toArray();

    res.send(result);
});

app.patch('/books/:id', verifyToken, async (req, res) => {
    const { id } = req.params
    const updates = { ...req.body }

    delete updates._id
    delete updates.ownerId
    delete updates.userEmail
    delete updates.userName

    const result = await BookNookCollection.updateOne(
        { _id: new ObjectId(id), ...ownerFilter(req.user) },
        { $set: updates }
    )

    if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Book not found." });
    }
    res.send(result)
})


app.delete('/books/:id', verifyToken, async (req, res) => {
    const { id } = req.params

    const result = await BookNookCollection.deleteOne({
        _id: new ObjectId(id),
        ...ownerFilter(req.user),
    })

    if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Book not found." });
    }
    res.send(result)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


export default app
