const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const passport = require('passport');
const User = require('./models/user');
const request = require('request');
const constants = require('./constants');

// Conenct to DB
mongoose.connect('mongodb://localhost/myWords');
var db = mongoose.connection;

// BodyParser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Express Session
app.use(session({
  secret: 'secret',
  saveUninitialized: true,
  resave: true
}));

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

var LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
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
  passport.authenticate('local'),
  function (req, res) {
    res.send(req.user);
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

// Get word info from Oxford API and add to list of words
app.get('/:userName/:word', function (req, res) {
  User.getUserByUsername(req.params.userName, function (err, user) {
    if (err) {
      console.log(err)
      res.status(500).send()
    }
    else {
      if (!user) {
        res.status(404).send()
      }
      else {
        if (req.params.userName) {
          queryOxfordAPI(req.params.word)
          var newWord = {
            word: req.params.word,
            definition: 'I am the second word'
          };
          User.findOneAndUpdate(
            { username: req.params.userName },
            { $push: { words: newWord } },
            function (error, success) {
              if (error) {
                res.status(500).send(error)
              } else {
                res.status(200).send(success)
              }
            }
          );
        }
      }
    }
  });
})

// Make Request to Oxford Dictionary API

function queryOxfordAPI(word) {

  const options = {
    url: 'https://od-api.oxforddictionaries.com/api/v1/entries/en/' + word,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
      'app_id': 'd4de0a86',
      'app_key': 'f1ffb7e5c87ce3eb6ce60f34c09c870d'
    }
  };

  request(options, function (err, res, body) {
    console.log(JSON)
    let json = JSON.parse(body);
    console.log(json);
    console.log(json.results[0].lexicalEntries[0].entries[0].senses[0].definitions)
  });

  /* I need:
  json.results[0].lexicalEntries[x].lexicalCategory for the adj/noun etc
  json.results[0].lexicalEntries[x].entries[0].senses[x].definitions
  json.results[0].lexicalEntries[0].pronunciations[0].audioFile
   and then update word subdocument accordingly (perhaps with a subsubdocument?)

  then (later) need to create a 'wordBank' database which includes example sentences and definitions
  */

}

app.listen(3000, () => console.log('App listening on port 3000!'))
