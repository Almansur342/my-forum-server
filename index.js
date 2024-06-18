const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000

const app = express()

const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.skihu85.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    const postCollection = client.db('forum').collection('posts');
    const userCollection = client.db('forum').collection('users');


    //jwt
    app.post('/jwt', async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECERT, {expiresIn: '365d'})
      res.send({token})
    })

    // middlewares 
    const verifyToken = (req,res,next)=>{
      // console.log('inside verify token',req.headers.authorization);
      if(!req.headers.authorization){
       return res.status(401).send({message: 'forbidden access'})
      }
      const token = req.headers.authorization.split(' ')[1]
      // console.log(token)
      jwt.verify(token,process.env.ACCESS_TOKEN_SECERT, (err, decoded)=>{
        if(err){
          return res.status(401).send({message: 'forbidden access'})
        } else{
          req.decoded = decoded;
          next()
        }

      })
      // next()
    } 

    
    // verify admin middlewares
    const verifyAdmin = async(req,res,next)=>{
      const user = req.decoded
      console.log('hello',user)
      const query = {email: user?.email}
      const result = await userCollection.findOne(query)
      if(!result || result?.role !== 'admin'){
        return res.status(401).send({message:'Unauthorized access!!'})
      }
      next()
    }

    // verify host middlewares
    const verifyHost = async(req,res,next)=>{
      const user = req.decoded
      
      console.log('hello',user)
      const query = {email: user?.email}
      const result = await userCollection.findOne(query)
      if(!result || result?.role !== 'host'){
        return res.status(401).send({message:'Unauthorized access!!'})
      }
      next()
    }

    // save user data
    app.put('/user', async (req, res) => {
      const user = req.body;
      // console.log(user.email)
      const isExist = await userCollection.findOne({ email: user?.email })
      if (isExist) {
        return res.send(isExist)
      }
      const options = { upsert: true }
      const query = { email: user?.email }
      const { _id, ...userWithoutId } = user;
      const updateDoc = {
        $set: {
          ...userWithoutId,
          timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })


    app.get('/user/:email', verifyToken, verifyHost, async (req, res) => {
      const email = req.params.email
      // console.log(email)
      const query = { email: email }
      const result = await userCollection.findOne(query)
      res.send(result)
    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

   app.patch('/user/update/:email', verifyToken, async (req, res) => {
  const email = req.params.email;
  const user = req.body;
 
  const query = { email };
  const { _id, ...userWithoutId } = user;
  const updateDoc = {
    $set: { ...userWithoutId, timestamp: Date.now() }
  };
  try {
    const result = await userCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).send({ message: 'Failed to update user role' });
  }
});


    app.get('/user_rol/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      // console.log(email)
      const query = { email: email }
      const result = await userCollection.findOne(query)
      res.send(result)
    })

    app.get('/three-posts/:email', verifyToken, verifyHost, async (req, res) => {
      const email = req.params.email
      const query = { hostEmail: email }
      const result = await postCollection.find(query).sort({ createdAt: -1 }).limit(3).toArray();
      res.send(result);
    })





    app.post('/posts', async (req, res) => {
      const postData = req.body
      const result = await postCollection.insertOne(postData)
      res.send(result)
    });

    app.get('/posts', async (req, res) => {
      const sort = req.query.sort === 'true';
      const size = parseInt(req.query.size)
      const search = req.query.search
      const page = parseInt(req.query.page) - 1

      let pipeline = [
        {
          $addFields: {
            voteDifference: {
              $subtract: [
                { $toInt: "$upVote" },
                { $toInt: "$downVote" }
              ]
            }
          }
        }
      ];

      if (search) {
        pipeline.push({
          $match: {
            tags_name: { $regex: search, $options: 'i' }
          }
        });
      }

      if (sort) {
        // console.log('Sorting by vote difference');
        pipeline.push({
          $sort: {
            voteDifference: -1
          }
        });
      } else {
        // console.log('sorting by newest to oldest');
        pipeline.push({
          $sort: {
            createdAt: -1
          }
        });
      }

      const result = await postCollection.aggregate(pipeline).skip(page * size).limit(size).toArray();
      res.send(result);
    });


    app.get('/post-count', async (req, res) => {
      const count = await postCollection.countDocuments()
      res.send({ count })
    })

    app.get('/my-posts/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      // console.log(email)
      const query = { hostEmail: email }
      const result = await postCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/deletePost/:id', verifyToken, verifyHost, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/postDetails/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.findOne(query)
      res.send(result)
    })


app.patch('/posts/vote/:id', async (req, res) => {
  const postId = req.params.id;
  const { email, voteType } = req.body; 
  
  try {
    const post = await postCollection.findOne({ _id: new ObjectId(postId) });
    if (!post) {
      return res.status(404).send({ message: 'Post not found.' });
    }

    const userVotes = post.userVotes || {};
    if (userVotes[email] && userVotes[email][voteType]) {
      return res.status(403).send({ message: `You have already ${voteType === 'upVote' ? 'up voted' : 'down voted'} this post.` });
    }

    if (!userVotes[email]) {
      userVotes[email] = { upVote: false, downVote: false };
    }

    userVotes[email][voteType] = true;
    const updateDoc = {
      $set: { userVotes }
    };

    if (voteType === 'upVote') {
      updateDoc.$inc = { upVote: 1 };
    } else if (voteType === 'downVote') {
      updateDoc.$inc = { downVote: 1 };
    }

    const query = { _id: new ObjectId(postId) };
    const result = await postCollection.updateOne(query, updateDoc);

  } catch (error) {
    console.error('Error processing vote:', error);
    res.status(500).send({ message: 'An error occurred while processing your vote.' });
  }
});




  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('hello from my forum server')
})

app.listen(port, () => {
  console.log(`server is running in port ${port}`)
})
