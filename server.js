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
  LocalStrategy = require('passport-local').Strategy
const User = require('./models/user');
const Word = require('./models/wordBank');
var request = require('request-promise');
const jwt = require('jsonwebtoken')
const checkAuth = require('./check-auth')
const constants = require('./constants');
const bluebird = require("bluebird");

// Conenct to DB
mongoose.connect('mongodb://localhost/myWords');
var db = mongoose.connection;

// Declare variable to store user ID
var userID = ""

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
            userID = user.id.toString() // save user ID for this session
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

// API request options for Oxford API
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

// API request options for Words API
const freq_options = {
  url: constants.WORDS_BASE_URL,
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'X-Mashape-Key': constants.WORDS_API_KEY
  }
};

// Get word info from Oxford API and add to list of words
app.get('/:userName/:word', checkAuth, function (req, res) {

  var word = new Word({
    word: req.params.word,
    definition: String,
    sentences: [String],
    lexicalCategory: String,
    mp3: mongoose.SchemaTypes.Url,
  })

  // build main request parameters
  options.url = constants.BASE_URL
  options.url += req.params.word
  const mainRequest = request(options)

  // build request parameters for separate request to get sentences
  const sentencesRequestOptions = options
  sentencesRequestOptions.url += '/sentences'
  const sentencesRequest = request(sentencesRequestOptions)

  // build request parameters for separate request to get sentences
  const frequencyRequestOptions = freq_options
  frequencyRequestOptions.url = constants.WORDS_BASE_URL
  frequencyRequestOptions.url += req.params.word
  const frequencyRequest = request(frequencyRequestOptions)

  bluebird.all([mainRequest, sentencesRequest, frequencyRequest])
    .spread(function (mainResponse, sentencesResponse, frequencyResponse) {

      //get main data
      const json = JSON.parse(mainResponse)
      // console.log(json.results[0].lexicalEntries[0].entries[0].senses[0].definitions[0])
      word.definition = json.results[0].lexicalEntries[0].entries[0].senses[0].definitions[0]
      word.lexicalCategory = json.results[0].lexicalEntries[0].lexicalCategory
      word.mp3 = json.results[0].lexicalEntries[0].pronunciations[0].audioFile

      // get sentence data 
      const sentenceJson = JSON.parse(sentencesResponse)
      for (x in sentenceJson.results[0].lexicalEntries[0].sentences) {
        word.sentences.push(sentenceJson.results[0].lexicalEntries[0].sentences[x].text)
      }

      const frequencyJson = JSON.parse(frequencyResponse)
      word.frequency = frequencyJson.frequency

      word.save(function (err, results) {
        if (err) {
          console.log(err)
          if (err._message == "Word validation failed") {
            Word.findOne({ word: req.params.word }, function (err, word) {
              if (err) {
                console.log(err)
              }
              if (word) {
                handleExistingWord(word._id, req.params.userName, res)
              }
            }).then(() => {
              return res.status(200).send()
            }).catch((err) => console.log(err))
          }
        }
        if (results) {
          User.findOneAndUpdate({ username: req.params.userName },
            { $push: { words: { wordID: results._id } } },
            ).then(() => {
                return res.status(201).send("word added")
            }).catch((err) => console.log(err))
        }
      })
    })
    .catch(function (err) {
      console.log(err)
    })
})

function handleExistingWord(word_id, userName, res) {

  User.findOne({ username: userName }, function (err, data) {
    if (err) {
      console.log(err)
    }
    if (data) {
      if (data.words.some(function (i) {
        return i.wordID.equals(word_id) //returns true if user already has word
      })) {
        return res.status(200).send("word already exists")
      }
      else {
        User.findOneAndUpdate({ username: userName },
          { $push: { words: { wordID: word_id } } },
          function (err, user) {
            if (err) {
              console.log(err)
            }
            if (user) {
              return res.status(201).send("word added")
            }
          })
      }
    }
  })
}

app.get('/:userName/myWords/all', checkAuth, function (req, res) {

  User.findOne({ username: req.params.userName })
  .then((user) => {
    return user.words.map(a => a.wordID)
 }) .then((wordIdArray) => {
      return Word.find({ '_id': { $in: wordIdArray }})
 }).then((words) => {
    return res.status(200).send(words)
 }).catch((err) => console.log(err))

})

//get ids for unlearned words
//get word data for first unlearned word
//get 4 other words that meet criteria
//return object to client

app.get('/:userName/myWords/test', checkAuth, function (req, res) {

  // Initialise response for quiz endpoint
  var quizResponse = [{
    word: "",
    definition: "",
    sentence: "",
    rightAnswer: true,
  }]

  User.findOne({ username: req.params.userName })
    .then((user) => {
      return unlearnedWords = user.words.filter(i => i.wordIsLearnt == false).map(i => ({ wordID: i.wordID }))
    }).then((unlearnedWords) => {
      return Word.findById(unlearnedWords[0].wordID)
    }).then((word) => {
      quizResponse[0].word = word.word
      quizResponse[0].definition = word.definition
      quizResponse[0].sentence = word.sentences[word.sentences.length - 1].replace(word.word, '_____')
      return word
    }).then((word) => {
      return Word.find({ lexicalCategory: word.lexicalCategory, frequency: { $gt: word.frequency } })
    }).then((wrongWords) => {
      for (let i = 0; i < 4; i++) {
        if (!wrongWords[i]) {
          break
        }
        else {
          quizResponse.push({
            word: wrongWords[i].word,
            definition: wrongWords[i].definition,
            sentence: wrongWords[i].sentences[wrongWords[i].sentences.length - 1]
              .replace(wrongWords[i].word, '_____'),
            rightAnswer: false,
          })
        }
      }
    }).then(() => {
      return res.status(200).send(quizResponse)
    }).catch(err => {
      console.log(err)
    })
})
app.get('/:userName/myWords/test/markLearnt', checkAuth, function (req, res) {
  User.findOne({ username: req.params.userName })
    .then((user) => {
      return unlearnedWords = user.words.filter(i => i.wordIsLearnt == false).map(i => ({ wordID: i.wordID }))
    }).then((unlearnedWords) => {
      console.log(unlearnedWords[0])
      User.findOneAndUpdate({username: req.params.userName}, 
        { $pull: { words: { wordID: unlearnedWords[0].wordID.toString() } } }, { 'new': true }, function(err, doc) {
          if(err) {
            console.log(err)
          }
          if(doc) {
            console.log(doc)
          }
        }
      )
    }).catch((err) => {
      console.log(err)
    })
    res.status(200).send()
})


/* 
  I want to return:
    - right answer (word, definition, example sentence, rightAnswer = true)
    - wrong answer (word, definition, example sentence, rightAnswer = false)
    - wrong answer (word, definition, example sentence, rightAnswer = false)
    - wrong answer (word, definition, example sentence, rightAnswer = false)
    - wrong answer (word, definition, example sentence, rightAnswer = false)
 */

// TODO: Reduce sentence json for relevant sense / handle duplicate word entries

app.listen(port, () => console.log('App listening on port:' + port))
