const mongoose = require('mongoose')

const messageModel = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    content: {
        type: String,
        trim: true
    },
    Chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat'
    },

},
    {
        timestamps: true
    })
const message = mongoose.model('Message', messageModel);
module.exports = message