const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
require('dotenv').config();
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');

const app = express();
app.use(express.json());
app.use(cors());

app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User schema
const userSchema = new mongoose.Schema({
  name: String,
  region: String,
  number: String,
  quizScore: {
    score: Number,
    timeTaken: Number, // Assuming time taken is in seconds
    userComment:String
  },
  snapScore: Number,
  videoUrl: String,
  imageUrl: String,
  imageorvideo: String,
});

const User = mongoose.model("User", userSchema);

// Multer configuration for file upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB maximum file size
    files: 1 // Limit to one file per request
  }
});

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();

// Cloudinary configuration
// cloudinary.config({
//   cloud_name: process.env.cloud_name,
//   api_key: process.env.api_key,
//   api_secret: process.env.api_secret,
// });

app.get("/",(req,res)=>{
  return "server is Running...."
})

app.post("/api/users", async (req, res) => {
  try {
    const { name, region, number } = req.body;

    // Check if number already exists
    const existingUser = await User.findOne({ number });
    if (existingUser) {
      return res.status(201).json({ error: "number already exists", existingUser});
    }

    // Create a new user
    const user = new User({ name, region, number, quizScore: {score: 0,timeTaken: 0,userComment:""}, snapScore: 0, videoUrl: "", imageUrl: "" });
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/videos/:userId", upload.single("video"), async (req, res) => {
  try {
    const userId = req.params.userId;
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload video to S3 bucket
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `videos/${userId}/${req.file.originalname}`,
      Body: req.file.buffer
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    // Save the video URL to the user record in MongoDB
    const videoUrl = uploadResult.Location;

    // Update the user's videoUrl field
    await User.findByIdAndUpdate(userId, { videoUrl });
    res.status(200).json({ message: "Video uploaded successfully", videoUrl });
  } catch (error) {
    console.error("Error uploading video:", error.message);
    res.status(500).json({ error: "Error uploading video" });
  }
});

app.post("/api/users/images/:userId", upload.single("image"), async (req, res) => {
  try {
    const userId = req.params.userId;
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload image to S3 bucket
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `images/${userId}/${req.file.originalname}`,
      Body: req.file.buffer
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    // Save the image URL to the user record in MongoDB
    const imageUrl = uploadResult.Location;
    console.log(imageUrl,"imageurl")

    // Update the user's imageUrl field
    await User.findByIdAndUpdate(userId, { imageUrl });
    res.status(200).json({ message: "Image uploaded successfully", imageUrl });
  } catch (error) {
    console.error("Error uploading image:", error.message);
    res.status(500).json({ error: "Error uploading image" });
  }
});

app.post("/api/users/upload/:userId", upload.single("file"), async (req, res) => {
  try {
    const userId = req.params.userId;
    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Determine if the uploaded file is an image or a video based on its MIME type
    const fileType = req.file.mimetype.startsWith("image/") ? "image" : req.file.mimetype.startsWith("video/") ? "video" : null;
    if (!fileType) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    // Upload file to S3 bucket
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${fileType}s/${userId}/${req.file.originalname}`,
      Body: req.file.buffer
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    // Save the file URL to the user record in MongoDB
    const fileUrl = uploadResult.Location;
    user.imageorvideo = fileUrl;

    await user.save()
    console.log(user)
    res.status(200).json({ message: "File uploaded successfully", fileUrl });
  } catch (error) {
    console.error("Error uploading file:", error.message);
    res.status(500).json({ error: "Error uploading file" });
  }
});


app.put("/api/users/quizscore/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;    
    const { score, timeTaken, userComment } = req.body;
    console.log(req.body,"body")
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's quiz score
    user.quizScore.score = score;
    user.quizScore.timeTaken = timeTaken;
    user.quizScore.userComment = userComment;

    await user.save();
    console.log(user)

    res.status(200).json({ message: "Quiz score updated successfully", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/users/snapscore/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { score } = req.body;
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's snap score
    user.snapScore = score;
    await user.save();
    console.log(user)
    res.status(200).json({ message: "Snap score updated successfully", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/users/sort-by-snap-score", async (req, res) => {
  try {
    // Find all users and sort by snap score in descending order
    const users = await User.find().sort({ snapScore: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/users/sort-by-quiz-score", async (req, res) => {
  try {
    // Find all users and sort by time taken in ascending order and score in descending order
    const users = await User.find().sort({  "quizScore.score": -1, "quizScore.timeTaken": 1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
