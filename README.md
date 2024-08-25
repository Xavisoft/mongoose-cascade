
@xavisoft/mongoose-cascade
===


This npm package enables easy implementation of **ON DELETE CASCADE**, **SET NULL**, and **RESTRICT** behaviors in Mongoose schemas for MongoDB databases.

Unlike SQL-based databases, MongoDB does not provide these features by default. @xavisoft/mongoose-cascade fills this gap by simplifying the management of cascading operations in your MongoDB databases, ensuring referential integrity in your database schemas.

## Installation

```bash
npm install @xavisoft/mongoose-cascade
```

## Example
```js

const { default: mongoose, Schema } = require("mongoose");
const { Cascade, constants } = require('@xavisoft/mongoose-cascade');

// create models
const User = mongoose.model('User', new Schema({
   name: String,
   surname: String,
}));

const Comment = mongoose.model('User', new Schema({
   text: String,
   user: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      onDelete: constants.ON_DELETE.SET_NULL,
   }
   createdAt: Date,
}));

// create docs
const cap = await User.create({
   name: 'Steve',
   surname: 'Rogers',
});

const comment = await Comment.create({
   text: 'I can do this all day!',
   user: cap._id
   createdAt: new Date(),
});

// delete
const cascade = new Cascade();
cascade.init();

await cascade.delete(User, { _id: cap._id });

// check
const updatedComment = await Comment.findById(comment._id);
console.log(updatedComment.user); // null

```