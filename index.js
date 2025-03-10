const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000

const app = express()

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://6676848b769ada53d958df19--heroic-kelpie-0a51f0.netlify.app",
  ],
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
    const commentCollection = client.db('forum').collection('comments');
    const bookingCollection = client.db('forum').collection('bookings');
    const announcementsCollection = client.db('forum').collection('announcements');
    const tagsCollection = client.db('forum').collection('tags');


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
      // console.log('hello',user)
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
      
      // console.log('hello',user)
      const query = {email: user?.email}
      const result = await userCollection.findOne(query)
      if(!result || result?.role !== 'host'){
        return res.status(401).send({message:'Unauthorized access!!'})
      }
      next()
    }

   

     //create-payment-intent 
     app.post('/create-payment-intent', verifyToken, async(req,res)=>{
      const price = req.body.price
      const priceInCent = parseFloat(price) * 100
      if(!price || priceInCent < 1) return

    // generate client secret
      const {client_secret} = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "cad",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      })

      
      // send client secret as response
      res.send({clientSecret: client_secret})
     })

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
      const size = parseInt(req.query.size)
      const page = parseInt(req.query.page) - 1
      const result = await userCollection.find().skip(page * size).limit(size).toArray()
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



    app.post('/posts', verifyToken, async (req, res) => {
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
      const search = req.query.search
      let query = {
        tags_name: { $regex: search, $options: 'i' }
      }
      const count = await postCollection.countDocuments(query)
      res.send({ count })
    })

    app.get('/my-posts/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const size = parseInt(req.query.size)
      const page = parseInt(req.query.page) - 1
      // console.log(email)
      const query = { hostEmail: email }
      const result = await postCollection.find(query).skip(page * size).limit(size).toArray()
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
    res.send({ message: 'Vote registered successfully' });

  } catch (error) {
    

    res.status(500).send({ message: 'An error occurred while processing your vote.' });
  }
});


app.post('/comment', async(req,res)=>{
 const commentData = req.body
 const result = await commentCollection.insertOne(commentData)
 res.send(result)
})

app.get('/allComments/:post_title', async(req,res)=>{
  const post_title = req.params.post_title
  const size = parseInt(req.query.size)
  const page = parseInt(req.query.page) - 1
  // console.log(post_title)
  const query = { post_title: post_title }
      const result = await commentCollection.find(query).skip(page * size).limit(size).toArray()
      res.send(result)
})
app.get('/myCommentsCount/:post_title', async(req,res)=>{
  const post_title = req.params.post_title
  const query = { post_title: post_title }
      const result = await commentCollection.find(query).toArray()
      res.send(result)
})

app.patch('/reportComment/:id', verifyToken, verifyHost, async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body;
  console.log(reason)
  const report = { reason, timestamp: new Date() };
  try {
    const query = { _id: new ObjectId(id) };
    const updateDoc = { $push: { reports: report } };
    const result = await commentCollection.updateOne(query, updateDoc);
    if (result.modifiedCount === 1) {
      res.send({ message: 'Comment reported successfully' });
    } else {
      res.status(404).send({ message: 'Comment not found' });
    }
  } catch (error) {
    console.error('Error reporting comment:', error);
    res.status(500).send({ message: 'An error occurred while reporting the comment' });
  }
});

app.get('/reportComment', verifyToken,verifyAdmin, async (req, res) => {
     const size = parseInt(req.query.size)
      const page = parseInt(req.query.page) - 1
  try {
    const result = await commentCollection.find({ reports: { $exists: true, $not: { $size: 0 } } }).skip(page * size).limit(size).toArray();
    res.send(result);
  } catch (error) {
    console.error('Error fetching reported comments:', error);
    res.status(500).send({ message: 'An error occurred while fetching reported comments' });
  }
});

app.delete('/deleteComment/:id', verifyToken, verifyAdmin, async (req,res) =>{
  const id = req.params.id;
  const query = { _id: new ObjectId(id) }
  const result = await commentCollection.deleteOne(query)
  res.send(result)
})


app.patch('/ignoreReport/:id', verifyToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await commentCollection.updateOne({ _id: new ObjectId(id) }, { $set: { reports: [] } });
    if (result.modifiedCount === 1) {
      res.send({ message: 'Report ignored successfully' });
    } else {
      res.status(404).send({ message: 'Comment not found' });
    }
  } catch (error) {
    console.error('Error ignoring report:', error);
    res.status(500).send({ message: 'An error occurred while ignoring the report' });
  }
});


app.patch('/warning/:id', verifyToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const warning = {
    message: "Inappropriate content",
    timestamp: new Date()
  };
  try {
    const result = await commentCollection.updateOne(
      { _id: new ObjectId(id) },
      { $push: { warnings: warning } }
    );
    if (result.modifiedCount === 1) {
      res.send({ message: 'Warning issued successfully' });
    } else {
      res.status(404).send({ message: 'Comment not found' });
    }
  } catch (error) {
    // console.error('Error issuing warning:', error);
    res.status(500).send({ message: 'An error occurred while issuing the warning' });
  }
});

// save bookings
 app.post('/booking', verifyToken, async (req, res) => {
  const bookingData = req.body
  // save room booking data
  const result = await bookingCollection.insertOne(bookingData)
  res.send(result)
});

app.patch('/userBadge', verifyToken, async (req, res) => {
  const userEmail = req.body.email;

  try {
    const result = await userCollection.updateOne(
      { email: userEmail },
      { $set: { badge: 'Gold' } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).send({ message: 'Badge updated to Gold' });
    } else {
      res.status(400).send({ message: 'Failed to update badge' });
    }
  } catch (error) {
    res.status(500).send({ message: 'Internal Server Error', error });
  }
});


app.get('/userBadge', verifyToken, async (req, res) => {
  const userEmail = req.query.email;

  try {
    const user = await userCollection.findOne({ email: userEmail });
    if (user) {
      res.status(200).send({ badge: user.badge });
    } else {
      res.status(404).send({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).send({ message: 'Internal Server Error', error });
  }
});

app.post('/announcements', verifyToken, async (req, res) => {
  const announcementData = req.body
  const result = await announcementsCollection.insertOne(announcementData)
  res.send(result)
})

app.get('/allAnnounce', async (req, res) => {
  const result = await announcementsCollection.find().toArray()
  res.send(result)
})
app.get('/userCount', async (req, res) => {
  const result = await userCollection.find().toArray()
  res.send(result)
})
app.get('/reportCommentCount', async (req, res) => {
  const result = await commentCollection.find({ reports: { $exists: true, $not: { $size: 0 } } }).toArray();
  res.send(result);
})

app.get('/admin-profile', async (req, res) => {
  const result = await userCollection.findOne({ role: 'admin' }); 
  res.send(result); 
});

app.get('/comment-count', async (req, res) => {
  const result = await commentCollection.find().toArray()
  res.send(result)
});

app.get('/postCount', async (req, res) => {
  const result = await postCollection.find().toArray()
  res.send(result)
});

app.post('/tags', verifyToken, verifyAdmin, async (req, res) => {
  const tag = req.body;
  const result = await tagsCollection.insertOne(tag);
  res.send(result);
});

app.get('/tags', async (req, res) => {
  const result = await tagsCollection.find().toArray()
  res.send(result)
})



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
