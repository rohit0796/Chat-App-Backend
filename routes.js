const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const app = express.Router()
const Schema = require('./Models/usermodel')
const Chat = require('./Models/chartModel')
const Message = require('./Models/messageModel')
app.post('/api/register', async (req, res) => {
    console.log(req.body)
    try {
        const newPassword = await bcrypt.hash(req.body.password, 10)
        const user = new Schema({
            name: req.body.name,
            email: req.body.email,
            password: newPassword,
        })
        await user.save()
        res.json({ status: 'ok', message: 'Successfully Registered' })
    } catch (err) {
        console.log(err)
        if (err?.code == 11000) err = "Duplicate Email"
        res.json({ status: 'error', error: err })
    }
})

app.post('/api/login', async (req, res) => {
    const user = await Schema.findOne({
        email: req.body.email,
    })

    if (!user) {
        return res.json({ status: 'error', error: 'Email does not exists' })
    }

    const isPasswordValid = await bcrypt.compare(
        req.body.password,
        user.password
    )

    if (isPasswordValid) {
        const token = jwt.sign(
            {
                name: user.name,
                email: user.email,
            },
            'secret123'
        )

        return res.json({ status: 'ok', token: token, user: user, message: "Welcome Back!" })
    } else {
        return res.json({ status: 'error', user: false, error: 'Invalid Password' })
    }
})
app.get('/api/fetch-data', async (req, res) => {
    const token = req.headers['x-access-token']
    try {
        const decode = jwt.verify(token, 'secret123')
        const email = decode.email
        const user = await Schema.findOne({ email: email })
        res.json({ status: 'ok', user: user })
    } catch (error) {
        console.log(error)
        res.json({ status: 'error', error: 'Invalid Token' })
    }
})
app.get('/api/get-user', async (req, res) => {
    try {
        const user2 = await Schema.find();
        const users = user2.map((element) => {
          const { password, ...userWithoutPassword } = element.toObject();
          return userWithoutPassword;
        });        
        res.json({ status: 'ok', users: users });
    } catch (error) {
        console.log(error)
        res.json({ status: 'error', error: 'Something went wrong !!' })
    }
})
app.post('/api/accessChat', async (req, res) => {
    const { userid, searchid } = req.body;
    if (!userid) {
        console.log("UserId param not sent with request");
        return res.sendStatus(400);
    }

    var isChat = await Chat.find({
        isGroupChat: false,
        $and: [
            { users: { $elemMatch: { $eq: searchid } } },
            { users: { $elemMatch: { $eq: userid } } },
        ],
    })
        .populate("users", "-password")
        .populate("latestMessage");

    isChat = await Schema.populate(isChat, {
        path: "latestMessage.sender",
        select: "name pic email",
    });

    if (isChat.length > 0) {
        res.send(isChat[0]);
    } else {
        var chatData = {
            chatName: "sender",
            isGroupChat: false,
            users: [searchid, userid],
        };

        try {
            const createdChat = await Chat.create(chatData);
            const FullChat = await Chat.findOne({ _id: createdChat._id }).populate(
                "users",
                "-password"
            );
            res.status(200).json(FullChat);
        } catch (error) {
            res.status(400);
            throw new Error(error.message);
        }
    }
})

app.get('/api/fetch-chats/:id', async (req, res) => {
    const { id } = req.params;
    try {
        Chat.find({ users: { $elemMatch: { $eq: id } } })
            .populate("users", "-password")
            .populate("groupAdmin", "-password")
            .populate("latestMessage")
            .sort({ updatedAt: -1 })
            .then(async (results) => {
                results = await Schema.populate(results, {
                    path: "latestMessage.sender",
                    select: "name pic email",
                });
                res.status(200).send(results);
            });
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
})
app.get('/api/get-messages/:id', async (req, res) => {
    try {
        const messages = await Message.find({ Chat: req.params.id })
            .populate("sender", "name pic email")
            .populate("chat");
        res.json(messages);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
app.post('/api/send-messages', async (req, res) => {
    const { content, chatId, userId } = req.body;
    if (!content || !chatId) {
        console.log("Invalid data passed into request");
        return res.sendStatus(400);
    }

    var newMessage = {
        sender: userId,
        content: content,
        Chat: chatId,
    };
    try {
        
        var messages = new Message(newMessage);
        var message = await messages.save()
        message = await message.populate("sender", "name pic").execPopulate();
        message = await message.populate("Chat").execPopulate();
        message = await Schema.populate(message, {
            path: "Chat.users",
            select: "name pic email",
        });

        await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message });

        res.json(message);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
app.post('/api/create-groupChat', async (req, res) => {
    if (!req.body.users || !req.body.name) {
        return res.status(400).send({ message: "Please Fill all the feilds" });
    }

    var users = req.body.users

    if (users.length < 2) {
        return res
            .status(400)
            .send("More than 2 users are required to form a group chat");
    }

    try {
        const groupChat = await Chat.create({
            chatName: req.body.name,
            users: users,
            isGroupChat: true,
            groupAdmin: req.body.creator,
        });

        const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.status(200).json(fullGroupChat); 
    } catch (error) {
        res.status(400); 
        throw new Error(error.message);
    }
});
app.post('/api/update-group', async (req, res) => {
    try {
        const obj = req.body;

        const updatedGroup = await Chat.findByIdAndUpdate(obj._id, obj, { new: true })
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        if (!updatedGroup) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.status(200).json(updatedGroup);
    }
    catch (error) { 
        res.status(400);
        throw new Error(error.message);
    }
})
module.exports = app;