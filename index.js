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
const userCollection = db.collection('user')


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
    const authHeader = req.headers.authorization;
    console.log(authHeader);
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
    // console.log(token);

    const JEKS =  createRemoteJWKSet(new URL('http://localhost:3000/api/auth/jwks'));

    try {
        
        const {payload} = await jwtVerify(token, JEKS)
    } catch (error) {
        return res.status(500).send({ message: "server error" });
    }

    console.log(payload);
    
    
    next();
    
}

// GET http://localhost:5000/books → shob book list pbe
app.get('/books', async (req, res) => {
    const books = BookNookCollection.find({})
    const allBooks = await books.toArray()
    res.send(allBooks)
})


// GET http://localhost:5000/books/:id → 1 ta book er detail pbe
app.get('/books/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const result = await BookNookCollection.findOne({ _id: new ObjectId(id) })
    res.send(result)
})



const LOAN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// POST http://localhost:5000/my-borrows → borrow record banay, book er copy 1 komay
app.post("/my-borrows", async (req, res) => {
    const { _id, ...borrow } = req.body;

    const book = await BookNookCollection.findOne({ _id: new ObjectId(_id) })
    if (!book || book.availableCopies < 1) {
        return res.status(409).send({ message: "No copies are available for this book." })
    }

    await BookNookCollection.updateOne({ _id: book._id }, { $inc: { availableCopies: -1 } })

    const result = await myCollection.insertOne({ ...borrow, borrowedAt: new Date(), dueAt: new Date(Date.now() + LOAN_DAYS * DAY_MS) })
    res.send(result)
})



// DELETE http://localhost:5000/my/:id → borrow record muchay, book er copy firiye dey
app.delete("/my/:id", async (req, res) => {
    const { id } = req.params;
    const record = await myCollection.findOne({ _id: new ObjectId(id) })

    if (record?.bookId) {
        await BookNookCollection.updateOne(
            { _id: new ObjectId(record.bookId) },
            { $inc: { availableCopies: 1 } }
        )
    }

    await myCollection.deleteOne({ _id: new ObjectId(id) });
    res.send({ success: true });
})



// POST http://localhost:5000/books → notun book add kore
app.post("/books", async (req, res) => {
    const bookData = {
        ...req.body,
        totalCopies: Number(req.body?.totalCopies) || 0,
        availableCopies: Number(req.body?.availableCopies) || 0,
    };

    const result = await BookNookCollection.insertOne(bookData);
    res.send(result);
});



// GET http://localhost:5000/my/:email → oi email er user er shob borrow record pbe
app.get("/my/:email", async (req, res) => {
    const { email } = req.params;
    const result = await myCollection
        .find({ borrowerEmail: email })
        .toArray();

    res.send(result);
});

// PATCH http://localhost:5000/users/:email → user er name ar profile photo update kore
app.patch("/users/:email", async (req, res) => {
    const { email } = req.params;
    const { name, image } = req.body;
    const result = await userCollection.updateOne(
        { email },
        { $set: { name, image } }
    )
    const user = await userCollection.findOne({ email })
    res.send(user)
})

// GET http://localhost:5000/ → server chalche kina just check kore
app.get('/', (req, res) => {
    res.send('Hello World!');
});



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


export default app
