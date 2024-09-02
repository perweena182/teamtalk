const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const { v4: uuidV4 } = require("uuid");
require("dotenv").config();

const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
app.use("/", require("./routes/room.js"));

const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(
  session({
    secret: "Our Little Secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());
mongoose.set('strictQuery', true); // or false, depending on your preference

console.log('Server is starting...');
mongoose.connect('mongodb+srv://new_user_1:<password>@cluster0.u6f33.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
// , {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => {
//   console.log('Successfully connected to MongoDB Atlas!');
// })
// .catch((error) => {
//   console.error('Error connecting to MongoDB Atlas:', error);
// });


const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  secret: String,
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.serializeUser(function (user, done) {
  console.log('Serializing user:', user);
  done(null, user.id);
});
passport.deserializeUser(function (id, done) {
  console.log('Deserializing user by ID:', id);
  User.findById(id)
    .then(user => {
      console.log('Deserialized user:', user);
      done(null, user);
    })
    .catch(err => {
      console.error('Error during deserialization:', err);
      done(err, null);
    });
});


// passport.deserializeUser(function (id, done) {
//   console.log('Deserializing user by ID:', id);
//   User.findById(id, function (err, user) {
//     if (err) { console.error('Error during deserialization:', err); }
//     console.log('Deserialized user:', user);
//     done(err, user);
//   });
// });

// passport.use(User.createStrategy());
// passport.serializeUser(function (User, done) {
//   console.log("Serializing user:", user);
//   done(null, User);
// });

// passport.deserializeUser(function (User, done) {
//   console.log("Deserializing user with ID:", id);
//   done(null, User);
// });

let connections = [];

//socket handels users joining/leaving and messaging
io.on("connection", (socket) => {
  //request for joining room
  socket.on("join-room", (roomId, userId, userName) => {
    socket.join(roomId); //joining the mentioned room
    socket.broadcast.to(roomId).emit("user-connected", userId, userName);
    socket.on("send-message", (inputMsg, userName) => {
      io.to(roomId).emit("recieve-message", inputMsg, userName);
    });
    socket.on("disconnect", () => {
      socket.broadcast.to(roomId).emit("user-disconnected", userId, userName);
    });
  });
});

// let connections = [];

io.on("connect", (socket) => {
  connections.push(socket);
  console.log(`${socket.id} has connected`);

  socket.on("down", (data) => {
    console.log("down data", data);
    connections.forEach((con) => {
      if (con.id !== socket.id) {
        con.emit("ondown", { x: data.x, y: data.y });
      }
    });
  });

  socket.on("draw", (data) => {
    console.log("my data", data);
    connections.forEach((con) => {
      if (con.id !== socket.id) {
        con.emit("ondraw", { x: data.x, y: data.y });
      }
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`${socket.id} is disconnected`);
    connections = connections.filter((con) => con.id !== socket.id);
  });
});

//   passport.use(new GoogleStrategy({
//     clientID:    process.env.CLIENT_ID,
//     clientSecret: process.env.CLIENT_SECRET,
//     callbackURL: "http://localhost:3000/auth/google/helper",
//     passReqToCallback: true

//   },
//   function(request, accessToken, refreshToken, profile, done) {
//     User.findOrCreate({ googleId: profile.id }, function (err, user) {
//         console.log(user);
//       return done(err, user);
//     });
//   }
// ));

passport.use(
  new GoogleStrategy(
    {
      clientID: "process.env.CLIENT_ID",
      clientSecret: "process.env.CLIENT_SECRET",
      callbackURL: "http://localhost:3000/auth/google/helper",
      passReqToCallback: true,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (request, accessToken, refreshToken, profile, cb) {
      // console.log(profile);
       console.log("Google authentication successful. Profile:", profile);
      User.findOrCreate(
        { username: profile.emails[0].value, googleId: profile.id },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

let a;

app.get("/", function (req, res) {
  a = uuidV4();
  res.redirect(`/${a}`);
});

app.get("/helper", function (req, res) {
  console.log("dddd");

  console.log("qwerty");
  res.redirect("/" + a);
});

app.get("/:room", function (req, res) {
  console.log("123");
  if (req.isAuthenticated()) {
    console.log("faf");
    res.render("room", { roomId: req.params.room });
  } else {
    console.log("ff");
    res.redirect("/auth/google");
  }
});

// app.get('/auth/google',
//   passport.authenticate('google', { scope:
//       ['profile'] }
// ));
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/helper",
  passport.authenticate("google", {
    successRedirect: "/helper",
    failureRedirect: "/auth/google",
  })
);

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.on("ready", () => {
      socket.to(roomId).emit("user-connected", userId);
    });
    socket.on("message", (senderID, message) => {
      console.log(message);
      io.to(roomId).emit("createMessage", senderID, message);
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });
  });
});
server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});

// server.listen(3000);
