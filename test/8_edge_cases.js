const { default: mongoose, Schema, SchemaTypes } = require("mongoose");
const { emptyDB, createModelName } = require("./utils");
const { ON_DELETE } = require("../constants");
const { Cascade, DeleteRestrictedError } = require("..");
const { assert } = require("chai");

suite("Edge cases", function() {

   this.beforeEach(emptyDB);

   suite("Self reference", function() {
      suite("Model", function() {
         Object
            .values(ON_DELETE)
            .forEach(onDelete => {
               test(onDelete, async () => {
                  // create model
                  const modelName = createModelName();
                  const Model = mongoose.model(modelName, new Schema({
                     parents: {
                        type: [ SchemaTypes.ObjectId ],
                        ref: modelName,
                        onDelete,
                     }
                  }));

                  await Model.init();

                  // create docs
                  const referredDoc = await Model.create({});
                  const referringDoc = await Model.create({ parents: [ referredDoc._id ] });

                  // delete
                  const cascade = new Cascade();
                  cascade.init();

                  try {
                     await cascade.delete(Model, { _id: referredDoc._id });
                  } catch (err) {
                     if (onDelete === ON_DELETE.RESTRICT) {
                        // should raise this specific error
                        assert.isTrue(err instanceof DeleteRestrictedError);
                        
                        // nothing should be deleted
                        const iAmNotDeleted = await Model.findById(referredDoc._id);
                        assert.isNotNull(iAmNotDeleted);
                        const meNeither = await Model.findById(referringDoc._id);
                        assert.isNotNull(meNeither);
                        
                        return;
                     }

                     throw err;
                  }

                  // check db
                  const docs = await Model.find({});
                  
                  switch (onDelete) {
                     case ON_DELETE.CASCADE:
                        assert.isEmpty(docs);
                        break;

                     case ON_DELETE.SET_NULL:
                        for (const doc of docs) {
                           const nullCount = doc.parents.filter(parent => parent === null).length;
                           assert.equal(nullCount, 1);
                           assert.isTrue(
                              doc.parents.every(item => String(item) !== referredDoc._id.toString())
                           )
                        }

                        break;

                     case ON_DELETE.PULL:
                        for (const doc of docs) {
                           assert.isTrue(
                              doc.parents.every(item => String(item) !== referredDoc._id.toString())
                           )
                        }

                        break;
                  
                     default:
                        throw new Error(`Invalid onDelete: ${onDelete}`);
                  }

               });
            });
      });

      suite("Doc", function() {
         Object
            .values(ON_DELETE)
            .forEach(onDelete => {
               test(onDelete, async () => {
                  // create model
                  const modelName = createModelName();
                  const Model = mongoose.model(modelName, new Schema({
                     parents: {
                        type: [ SchemaTypes.ObjectId ],
                        ref: modelName,
                        onDelete,
                     }
                  }));

                  await Model.init();

                  // create doc
                  const doc = await Model.create({});
                  doc.parents.push(doc._id);
                  await doc.save();

                  // delete
                  const cascade = new Cascade();
                  cascade.init();

                  try {
                     await cascade.delete(Model, { _id: doc._id });
                  } catch (err) {
                     if (onDelete === ON_DELETE.RESTRICT) {
                        assert.isTrue(err instanceof DeleteRestrictedError);
                        const iAmNotDeleted = await Model.findById(doc._id);
                        assert.isNotNull(iAmNotDeleted);
                        return;
                     }

                     throw err;
                  }

                  // check db
                  const docs = await Model.find({});
                  assert.isEmpty(docs);

               });
            });
      });
   });
});
