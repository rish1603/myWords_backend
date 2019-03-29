const mongoose = require('mongoose')
    require('mongoose-type-url');

const WordSchema = mongoose.Schema({
    word: String,
    definition: String,
    lexicalCategory: String,
    sentences: [String],
    mp3: mongoose.SchemaTypes.Url,
    frequency: Number
});

var Word = module.exports = mongoose.model('Word', WordSchema)

//lexical category
//definitions
//sentences (for primary definition)
//audio file link

