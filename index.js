const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const express = require('express')
// const cors = require('cors')
// require('dotenv').config()
// const port = process.env.PORT || 5000;
// const jwt = require('jsonwebtoken');
// const app = express()

// app.use(cors());
// app.use(express.json());

const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken')
require('dotenv').config()
const port = process.env.PORT || 5000

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.tus40xp.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized User!!' })
    }
    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            res.status(403).send({ message: 'Invalid Token!' })
        }
        else {

            req.decoded = decoded
            next();
        }
    })
}


async function run() {
    try {
        const userCollection = client.db('boiBazar').collection('users')
        const bookCollection = client.db('boiBazar').collection('books')
        const categoriesCollection = client.db('boiBazar').collection('categories')
        const bookingsCollection = client.db('boiBazar').collection('booking')
        const paymentsCollection = client.db('boiBazar').collection('payments')

        // Create jwt
        app.get('/jwt', async (req, res) => {
            const userEmail = req.query.email
            const query = { userEmail: userEmail }
            const user = await userCollection.findOne(query)
            // res.send(user)
            // console.log(user)
            if (user) {
                const token = jwt.sign({ userEmail }, process.env.ACCESS_TOKEN, { expiresIn: '24h' })

                return res.send({
                    status: true,
                    data: token
                })
            }
            else {
                res.send({
                    status: false,
                    message: 401
                })
            }
        })


        //verify admin 
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.userEmail;
            const query = { userEmail: decodedEmail };
            const user = await userCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // check user Role isAdmin or isBuyer or isSeller
        app.get('/userRole/:email', async (req, res) => {
            const userEmail = req.params.email;
            const query = { userEmail: userEmail }
            const user = await userCollection.findOne(query);
            const userRole = user.role
            res.send({
                status: true,
                data: userRole
            })

        })

        app.get('/isVerify/:email', async (req, res) => {
            const userEmail = req.params.email;
            const query = { userEmail: userEmail }
            const user = await userCollection.findOne(query);
            res.send({ isVerify: user?.verify === true });
        })

        // added user
        app.post('/users', async (req, res) => {
            const user = req.body
            if (user.role === 'Seller') {
                user.verify = 'false'
            }

            const result = await userCollection.insertOne(user)
            res.send(
                {
                    status: true,
                    data: result
                }
            )
        })


        // added books
        app.post('/addbook', async (req, res) => {
            const book = req.body
            const result = await bookCollection.insertOne(book)
            res.send(
                {
                    status: true,
                    data: result
                }
            )
        })

        // add booking
        app.post('/bookings', async (req, res) => {
            const bookingInfo = req.body;
            const result = await bookingsCollection.insertOne(bookingInfo)
            if (result) {
                res.send(
                    {
                        status: true,
                        data: result
                    }
                )
            }
        })

        // payment api
        app.post("/create-payment-intent", async (req, res) => {
            const data = req.body;
            const productPrice = data.productPrice
            const amount = productPrice * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });


        app.post('/payment', async (req, res) => {
            const payment = req.body
            const result = await paymentsCollection.insertOne(payment)
            const id = payment.bookingId
            const productId = payment.productId

            // update booking collection status
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    status: 'Sold'
                }
            }
            const updateBooking = await bookingsCollection.updateOne(filter, updatedDoc, options);

            // update product collection status
            const query = { _id: ObjectId(productId) }

            const updatedDoc2 = {
                $set: {
                    status: 'Sold'
                }
            }
            const updateBooks = await bookCollection.updateOne(query, updatedDoc2, options);



            res.send(result)
        })

        // Get Category from database
        app.get('/categories', async (req, res) => {
            const query = {}
            const result = await categoriesCollection.find(query).toArray()
            res.send({
                status: true,
                data: result
            })
        })

        // get Products by seller email
        app.get('/books', async (req, res) => {
            const email = req.query.email
            const result = await bookCollection.find({ sellerEmail: email }).toArray()

            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })


        // get myOrder  by Buyer email
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email
            const result = await bookingsCollection.find({ buyerEmail: email }).toArray()
            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })

        // get bookings data by id

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollection.findOne(query)
            if (result) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })


        // get advertise books
        app.get('/getAdvertised', async (req, res) => {
            const result = await bookCollection.find({ Advertise: true }).toArray()
            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })

        // get Products by category data
        app.get('/books/:categoryName', async (req, res) => {
            const categoryName = req.params.categoryName
            const result = await bookCollection.find({ category: categoryName }).toArray()
            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {

            const userRole = req.query.role
            const result = await userCollection.find({ role: userRole }).toArray()
            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })

        //set advertise

        app.get('/setAdvertise:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    Advertise: true
                }
            }
            const result = await bookCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        // set verify Seller
        app.get('/setVerify:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    verify: true
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options);

            if (result.acknowledged) {
                res.send({
                    status: true
                })
            }
            else {
                res.send({
                    status: false
                })
            }

        })

        //delete user
        app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: ObjectId(id) }
                const result = await userCollection.deleteOne(query)
                res.send({
                    status: true,
                    message: "Delete User Successfully"
                })
            } catch (error) {
                console.log(error.name, error.message, error.stack)
            }
        })

        //delete My Product
        app.delete('/myProduct/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: ObjectId(id) }
                const result = await bookCollection.deleteOne(query)
                res.send({
                    status: true,
                    message: "Delete User Successfully"
                })
            } catch (error) {
                console.log(error.name, error.message, error.stack)
            }
        })


        // set reported item
        app.get('/setReportItem:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    report: true
                }
            }
            const result = await bookCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })


        // get report books
        app.get('/getReportItem', async (req, res) => {
            const result = await bookCollection.find({ report: true }).toArray()

            if (result.length) {
                res.send({
                    status: true,
                    data: result
                })
            }
            else {
                res.send({
                    status: false
                })
            }
        })


        // for data inject---

        // app.get('/addverify', async (req, res) => {
        //     const filter = { role: 'Seller' }
        //     const options = { upsert: true }
        //     const updatedDoc = {
        //         $set: {
        //             verify: false
        //         }
        //     }
        //     const result = await userCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // })


        // app.get('/addCategory', async (req, res) => {
        //     const cat = {
        //         categoryName: 'Story'
        //     }
        //     const result = await categoriesCollection.insertOne(cat)
        //     res.send(
        //         {
        //             status: true,
        //             data: result
        //         }
        //     )
        // })


    }
    finally {

    }

}
run().catch(error => console.error(error))



app.get('/', (req, res) => {
    res.send('Boi-Bazar Server is working ')
})

app.listen(port, () => {
    console.log((`Boi Bazar ser is running on port : ${port}`))
})