const { Schema, default: mongoose } = require("mongoose");
const { createModelName, emptyDB } = require("./utils");
const { Cascade } = require("..");
const { assert } = require("chai");

suite("Multiple connections", function() {
   test("Multiple connections", async function() {

      // empty db
      await emptyDB();

      // models
      /// names
      const referredModelName = createModelName();
      const referringModelName = createModelName();

      /// schemas
      const referredSchema = new Schema({});
      const referringSchema = new Schema({
         attribute: {
            type: mongoose.Schema.ObjectId,
            ref: referredModelName,
            onDelete: Cascade.constants.ON_DELETE.SET_NULL,
            required: true,
         }
      });

      /// default connection models
      const DefaultReferredModel = mongoose.model(referredModelName, referredSchema);
      const DefaultReferringModel = mongoose.model(referringModelName, referringSchema);
      await DefaultReferredModel.init();
      await DefaultReferringModel.init();

      /// conn2 models
      const conn2 = mongoose.createConnection('mongodb://localhost:27017/conn-2');
      const Conn2ReferredModel = conn2.model(referredModelName, referredSchema);
      const Conn2ReferringModel = conn2.model(referringModelName, referringSchema);
      await Conn2ReferredModel.init();
      await Conn2ReferringModel.init();
      
      // cascades
      const defaultCascade = new Cascade();
      defaultCascade.init();

      const conn2Cascade = new Cascade(conn2);
      conn2Cascade.init();

      // create
      let defaultReferredDoc = await DefaultReferredModel.create({});
      let conn2ReferredDoc = await Conn2ReferredModel.create({});
      let defaultReferringDoc = await DefaultReferringModel.create({ attribute: defaultReferredDoc._id });
      let conn2ReferringDoc = await Conn2ReferringModel.create({ attribute: conn2ReferredDoc._id });

      // delete
      await defaultCascade.delete(DefaultReferredModel, { _id: defaultReferredDoc._id });
      await conn2Cascade.delete(Conn2ReferredModel, { _id: conn2ReferredDoc._id });

      // check db
      /// referred docs should be deleted
      defaultReferredDoc = await DefaultReferredModel.findById(defaultReferredDoc._id);
      assert.isNull(defaultReferredDoc);
      conn2ReferredDoc = await Conn2ReferredModel.findById(conn2ReferredDoc._id);
      assert.isNull(conn2ReferredDoc);

      /// references should be set to null
      defaultReferringDoc = await DefaultReferringModel.findById(defaultReferringDoc._id);
      assert.isNull(defaultReferringDoc.attribute);
      conn2ReferringDoc = await Conn2ReferringModel.findById(conn2ReferringDoc._id);
      assert.isNull(conn2ReferringDoc.attribute);

   });
});