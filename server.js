import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import Thought from './models/thought'
import Comment from './models/comment'

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/happyThoughts"
mongoose.connect(mongoUrl, {
  useNewUrlParser: true, useUnifiedTopology: true,
  useFindAndModify: false
})
mongoose.Promise = Promise

// Defines the port the app will run on. Defaults to 8080, but can be 
// overridden when starting the server. For example: PORT=9000 npm start
const port = process.env.PORT || 8080
const app = express()

const listEndpoints = require('express-list-endpoints')

// Add middlewares to enable cors and json body parsing,
// and handling if API service is unavailable
app.use(cors())
app.use(bodyParser.json())
app.use((req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    next()
  } else {
    res.status(503).json({ error: 'Service unavailable' })
  }
})

// Error messages
const ERR_NO_THOUGHTS = 'There are no happy thoughts yet'
const ERR_NO_PAGE = 'Requested page not found, could not get thoughts'
const ERR_GET_THOUGHTS = 'Invalid request, could not get thoughts'
const ERR_POST_THOUGHT = 'Invalid request, could not save thought'
const ERR_POST_LIKE = 'Invalid request, could not save like'
const ERR_NO_COMMENTS = 'The thought has no comments'
const ERR_GET_COMMENTS = 'Invalid request, could not get comments'
const ERR_POST_COMMENT = 'Invalid request, could not save comment'

// Root endpoint
app.get('/', (req, res) => {
  res.send(listEndpoints(app))
})

// Endpoint returning 20 thoughts
app.get('/thoughts', async (req, res) => {
  const { page, sort } = req.query
  const pageNo = +page || 1
  const perPage = 20
  // skip: E.g. page 3: 10 * (3-1) = 20, sends 20 as parameter to .skip()
  // skips index 0-19 so that page 3 starts with the book that has index 20
  const skip = perPage * (pageNo - 1)
  const allThoughts = await Thought.find()
  const numThoughts = allThoughts.length
  const pages = Math.ceil(numThoughts / perPage)

  const sortThoughts = (sort) => {
    if (sort === 'oldest') {
      return { createdAt: 1 }
    } else if (sort === 'loved') {
      return { hearts: -1 }
    } else {
      return { createdAt: -1 }
    }
  }

  try {
    const thoughts = await Thought.find()
      .sort(sortThoughts(sort))
      .skip(skip)
      .limit(perPage)
      .populate('comments')

    if (numThoughts === 0) {
      res.status(200).json({ message: ERR_NO_THOUGHTS })
    } else if (+page > pages) {
      res.status(404).json({ message: ERR_NO_PAGE })
    } else {
      res.status(200).json({
        total_pages: pages,
        page: pageNo,
        thoughts: thoughts
      })
    }
  } catch (err) {
    res.status(400).json({ message: ERR_GET_THOUGHTS })
  }

})

// Endpoint expecting a JSON body with the thought message
app.post('/thoughts', async (req, res) => {
  const { message, createdBy } = req.body

  try {
    const thought = await new Thought({ message, createdBy }).save()

    res.status(201).json(thought)
  } catch (err) {
    res.status(400).json({ message: ERR_POST_THOUGHT })
  }

})

// Endpoint taking in _id as params, updating hearts property to add one heart
// Incrementing like and not adding new data to DB, therefore using POST and not PUT
app.post('/thoughts/:id/like', async (req, res) => {
  const { id } = req.params

  try {
    const thoughtLiked = await Thought.findOneAndUpdate(
      { _id: id },
      { $inc: { hearts: 1 } },
      { new: true }
    )

    res.status(201).json(thoughtLiked)
  } catch (err) {
    res.status(400).json({ message: ERR_POST_LIKE })
  }

})

app.get('/thoughts/:id/comments', async (req, res) => {
  const { id } = req.params

  try {
    const comments = await Comment.find({ message: id })

    if (comments.length > 0) {
      res.status(200).json(comments)
    } else {
      res.status(200).json({ message: ERR_NO_COMMENTS })
    }
  } catch (err) {
    res.status(400).json({ message: ERR_GET_COMMENTS })
  }
})

app.post('/thoughts/:id/comments', async (req, res) => {
  const { id } = req.params
  const { comment, createdBy, message } = req.body

  try {
    const commentSent = await new Comment({ comment, createdBy, message }).save()

    await Thought.findOneAndUpdate(
      { _id: id },
      {
        $inc: { comment_count: 1 },
        $push: { comments: commentSent._id }
      },
      { new: true }
    )
    res.status(201).json(commentSent)
  } catch (err) {
    res.status(400).json({ message: ERR_POST_COMMENT })
  }

})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
