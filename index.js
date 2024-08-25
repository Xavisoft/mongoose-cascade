
const mongoose = require('mongoose');
const DeleteRestrictedError = require('./DeleteRestrictedError');
const constants = require('./constants');
const { buildReferenceMap } = require('./utils');


const { ON_DELETE } = constants;

class Cascade {

   static constants = constants;

   /**
    * 
    * @param {mongoose.Model} Model 
    * @param {object} filter
    * @param {object} opts
    * @param {mongoose.ClientSession|undefined} opts.session 
    */
   async delete(Model, filter, opts={}) {

      // initialize
      if (this._initialized)
         this.init();

      // create session if no session is provided
      let { session } = opts;
      const isSessionLocal = session ? false : true;

      if (isSessionLocal) {
         session = await this._conn.startSession();
         session.startTransaction();
      }

      const refLists = this._refLists;

      try {

         // find ids to be deleted
         const docs = await Model
            .find(filter)
            .select('_id')
            .session(session)
            .lean();

         const deletedIds = docs.map(doc => doc._id);
         
         // delete
         await Model.deleteMany(filter, { session });

         // cascade
         const modelName = Model.modelName;
         const refList = refLists[modelName];

         if (refList) {

            for (const ref of refList) {

               const { onDelete, model:ReferringModel, attribute } = ref;

               const filter = {
                  [attribute]: {
                     $in: deletedIds
                  }
               }; // the filter targets every doc that reference the deleted docs
               
               switch (onDelete) {
                  case ON_DELETE.CASCADE:
                     // delete all documents in this model that are referring to the deleted documents
                     await this.delete(ReferringModel, filter, { session });
                     break;

                  case ON_DELETE.SET_NULL:
                     {
                        // set every reference to the deleted docs to null
                        const { createSetNullOp } = ref;
                        const { update, arrayFilters } = createSetNullOp(deletedIds);
                        await ReferringModel.updateMany(filter, update, { session, arrayFilters });
                        break;
                     }

                  case ON_DELETE.RESTRICT:
                     {
                        // raise an error to abort if there are some documents still referring to the deleted documents
                        const count = await ReferringModel.countDocuments(filter, { session });

                        if (count > 0) {
                           const err = new DeleteRestrictedError(Model, deletedIds, ReferringModel);
                           err.code = ON_DELETE.RESTRICT;
                           throw err;
                        }

                        break;
                     }

                  case ON_DELETE.PULL:

                     {
                        // remove all references to the deleted docs from their respective arrays
                        const { createPullOp } = ref;
                        const update = createPullOp(deletedIds)
                        const toBeRemoved = await ReferringModel.updateMany(filter, update, { session });
                        if (!toBeRemoved.acknowledged) {
                           console.log(JSON.stringify(update, 0, 3));
                           console.log(JSON.stringify(ReferringModel.schema.obj, 0, 3));
                           process.exit();
                        }
                        break;
                     }
               
                  default:
                     throw new Error('Invalid onDelete value: ' + onDelete);
               }
            }
         }

         // commit
         if (isSessionLocal)
            await session.commitTransaction();

      } catch (err) {
         if (isSessionLocal)
            await session.abortTransaction();
         throw err;
      } finally {
         if (isSessionLocal)
            await session.endSession();
      }
   }

   /**
    * Initializes the object
    */
   init() {
      this._refLists = buildReferenceMap(this._conn);
      this._initialized = true;
   }

   /**
    * 
    * @param {mongoose.Connection} conn The mongoose connection to use. Defaults to {mongoose.connection}
    */
   constructor(conn=mongoose.connection) {
      this._conn = conn;
   }

}

// TODO: ADD github actions for publishing to NPM
// TODO: Documentation
// TODO: Add comments
// TODO: onDelete: restrict tests should test if docs are still intact (for now its only checking there error was raised)
// TODO: Make sure that if you raise DeleteRestrictedError and the developer still commits the session, it wont commit
// TODO: Are our edge cases really edge cases or we ought to give them another name
// TODO: Edge case: what happens if an attribute is an array of an array, and its in this form { attribute: [ { type: [ { type: Type } ]} ]}


module.exports = {
   Cascade,
   DeleteRestrictedError,
   constants,
};