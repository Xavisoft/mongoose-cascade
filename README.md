
@xavisoft/mongoose-cascade
===


This npm package enables easy implementation of **ON DELETE CASCADE**, **SET NULL**, and **RESTRICT** behaviors in Mongoose schemas for MongoDB databases.

Unlike SQL-based databases, MongoDB does not provide these features by default. This package fills this gap by simplifying the configuration of cascading operations in your MongoDB databases, ensuring referential integrity in your database schemas.

### Installation

```bash
npm install @xavisoft/mongoose-cascade
```

### Example
```js

const { default: mongoose, Schema } = require("mongoose");
const { Cascade, constants } = require('@xavisoft/mongoose-cascade');
const { ON_DELETE } = constants;

// create models
const User = mongoose.model('User', new Schema({
   name: String,
   surname: String,
}));

const Comment = mongoose.model('Comment', new Schema({
   text: String,
   user: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      onDelete: ON_DELETE.SET_NULL,
   },
   createdAt: Date,
}));

// create docs
const cap = await User.create({
   name: 'Steve',
   surname: 'Rogers',
});

const comment = await Comment.create({
   text: 'I can do this all day!',
   user: cap._id,
   createdAt: new Date(),
});

// delete
const cascade = new Cascade();
cascade.init();

await cascade.delete(User, { _id: cap._id });

// check
const updatedComment = await Comment.findById(comment._id);
console.log(updatedComment.user); // output: null

```

### Documentation
#### onDelete
To configure **on delete behavior** for your references, provide `onDelete` value with your schema references as shown in the above example, with one of the values below:
- `ON_DELETE.SET_NULL`: Set the references to the document(s) being deleted to `null`
- `ON_DELETE.CASCADE`: Delete all the document referencing the document(s) being deleted
- `ON_DELETE.RESTRICT`: Do not delete if there are still documents referencing the document(s). Instead raise a `DeleteRestrictedError`
- `ON_DELETE.PULL`: Apply the `$pull` operator on the array to remove items referencing document(s) being deleted

#### Cascade
* [Cascade](#Cascade)
    * [new Cascade(conn)](#new_Cascade_new)
    * [.delete(Model, filter, opts)](#Cascade+delete)
    * [.init()](#Cascade+init)

<a name="new_Cascade_new"></a>

##### new Cascade(conn)

| Param | Type | Description |
| --- | --- | --- |
| conn | <code>mongoose.Connection</code> | The mongoose connection to use. Defaults to `mongoose.connection` |

<a name="Cascade+delete"></a>

##### cascade.delete(Model, filter, opts)
Method to delete, cascading as per schema definitions


| Param | Type | Description |
| --- | --- | --- |
| Model | <code>mongoose.Model</code> | The model to delete from |
| filter | <code>object</code> | the `where` clause |
| opts | <code>object</code> |  |
| opts.session | <code>mongoose.ClientSession</code> | Provide this if the deletion needs to be part of an already started transaction |

<a name="Cascade+init"></a>

##### cascade.init()
Initializes the instance. Throws an error if something is wrong with your schemas
