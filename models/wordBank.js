const mongoose = require('mongoose')
require('mongoose-type-url');
const mongoValidator = require('mongoose-unique-validator')

const WordSchema = mongoose.Schema({
    word: {type: String, required: true, unique: true},
    definition: String,
    lexicalCategory: String,
    sentences: [String],
    mp3: mongoose.Types.Url,
    frequency: Number
});

WordSchema.plugin(mongoValidator)

var Word = module.exports = mongoose.model('Word', WordSchema)


//lexical category
//definitions
//sentences (for primary definition)
//audio file link

