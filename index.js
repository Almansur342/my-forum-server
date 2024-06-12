const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
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

  app.post('/posts', async(req,res)=>{
    const postData = req.body
    const result = await postCollection.insertOne(postData)
    res.send(result)
  });

  app.get('/posts', async (req, res) => {
    const sort = req.query.sort === 'true'; 
    const size = parseInt(req.query.size)
    const page = parseInt(req.query.page) - 1

    console.log(size,page);
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
  
    if (sort) {
      pipeline.push({
        $sort: {
          voteDifference: -1 
        }
      });
    }
  
    const result = await postCollection.aggregate(pipeline).skip(page*size).limit(size).toArray();
    res.send(result);
  });


  app.get('/post-count', async(req,res)=>{
    const count = await postCollection.countDocuments()
    res.send({count})
  })

  app.get('/my-posts/:email', async(req,res)=>{
    const email = req.params.email
    console.log(email)
    const query = {hostEmail:email}
    const result = await postCollection.find(query).toArray()
    res.send(result)
  })

  app.delete('/deletePost/:id', async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await postCollection.deleteOne(query)
    res.send(result)
  })


  
  
  
  
  


  } finally {
    // Ensures that the client will close when you finish/error
    
  }
}
run().catch(console.dir);



app.get('/', (req,res)=>{
  res.send('hello from my forum server')
})

app.listen(port, ()=>{
  console.log(`server is running in port ${port}`)
})
