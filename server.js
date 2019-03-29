const jwtSecret = require('./config/jwtConfig')
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const cors = require('cors')
const mongoose = require('mongoose');
const passport = require('passport'),
  LocalStrategy = require('passport-local').Strategy,
  JWTstrategy = require('passport-jwt').Strategy,
  ExtractJWT = require('passport-jwt').ExtractJwt;
const User = require('./models/user');
const Word = require('./models/wordBank');
const request = require('request');
const jwt = require('jsonwebtoken')
const checkAuth = require('./check-auth')
const constants = require('./constants');

// Conenct to DB
mongoose.connect('mongodb://localhost/myWords');
var db = mongoose.connection;

// BodyParser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Enable CORS
app.use(cors())

// Express Session
app.use(session({
  secret: 'secret',
  saveUninitialized: true,
  resave: true
}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "PUT, POST, PATCH, DELETE, GET");
    return res.status(200).json({});
  }
  next();
});

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// Register User
app.post('/register', function (req, res) {
  var password = req.body.password;
  var password2 = req.body.password2;

  if (password == password2) {
    var newUser = new User({
      email: req.body.email,
      username: req.body.username,
      password: req.body.password,
      words: req.body.words
    });

    User.createUser(newUser, function (err, user) {
      if (err) throw err;
      console.log("creating user: " + req.body.username)
      res.send(user).end()
    });
  } else {
    res.status(500).send("{errors: \"Passwords don't match\"}").end()
  }
});

// Used to verify log in details
passport.use('login',
  new LocalStrategy(
    function (username, password, done) {
      User.getUserByUsername(username, function (err, user) {
        if (err) throw err;
        if (!user) {
          return done(null, false, { message: 'Unknown User' });
        }
        User.comparePassword(password, user.password, function (err, isMatch) {
          if (err) throw err;
          if (isMatch) {
            return done(null, user);
          } else {
            return done(null, false, { message: 'Invalid password' });
          }
        });
      });
    }
  ));

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.getUserById(id, function (err, user) {
    done(err, user);
  });
});

// Endpoint to login
app.post('/login',
  passport.authenticate('login'),
  function (req, res) {
    // res.send(req.user);
    if (req.user) {
      const token = jwt.sign(
        {
          username: req.user.username,
        },
        jwtSecret.secret,
        {
          expiresIn: "1h"
        }
      );
      return res.status(200).json({
        message: "Auth successful",
        token: token
      });
    }
  }
);

// Endpoint to get current user
app.get('/user', function (req, res) {
  res.send(req.user);
})

// Endpoint to logout
app.get('/logout', function (req, res) {
  req.logout();
  res.send(null)
});

const options = {
  url: constants.BASE_URL,
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Accept-Charset': 'utf-8',
    'app_id': constants.APP_ID,
    'app_key': constants.APP_KEY
  }
};

// Get word info from Oxford API and add to list of words
app.get('/:userName/:word', function (req, res) {
  const userName = req.params.userName
  const newWord = req.params.word

    User.getUserByUsername(userName, function (err, user) {
      if (err) {
        console.log(err)
        return res.status(500).send("error occcured")
      }
      else {
        if (!user) {
          return res.status(404).send("user not found")
        }
        else {
          if (userName) {

            // resetting and rebuilding endpoint
            options.url = constants.BASE_URL
            options.url = options.url + newWord

            request(options, function (err, res, body) {
              if (err) {
                return res.status(500).send(error)
              }
              else {
                try {
                  let json = JSON.parse(body);
                  const word = new Word( {
                    word: newWord,
                    definitions: json.results[0].lexicalEntries[0].entries[0].senses[0].definitions,
                    lexicalCategory: json.results[0].lexicalEntries[x].lexicalCategory,
                    mp3: json.results[0].lexicalEntries[0].pronunciations[0].audioFile
                  })
                  console.log(json.results[0].lexicalEntries[0].entries[0].senses[0].definitions)
                } catch (err) {
                  console.log(err)
                }
              }
            });

            wordExample.save(function (err, word) {
              if (err) return handleError(err);

              User.findOneAndUpdate(
                { username: userName },
                { $push: { words: word.id } },
                function (error, success) {
                  if (error) {
                    res.status(500).send(error)
                  } else {
                    return res.status(200).send(success)
                  }
                }
              );

            });

          }
        }
      }
    });
})


// // Make Request to Oxford Dictionary API

  /* I need:
  json.results[0].lexicalEntries[x].lexicalCategory for the adj/noun etc
  json.results[0].lexicalEntries[x].entries[0].senses[x].definitions
  json.results[0].lexicalEntries[0].pronunciations[0].audioFile
   and then update word subdocument accordingly (perhaps with a subsubdocument?)

  then (later) need to create a 'wordBank' database which includes example sentences and definitions
  */

app.listen(port, () => console.log('App listening on port:' + port))
