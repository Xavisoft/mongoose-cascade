
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

      if (this._initialized)
         this.init();

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
                     await this.delete(ReferringModel, filter, { session });
                     break;

                  case ON_DELETE.SET_NULL:
                     {
                        const { createSetNullOp } = ref;
                        const { update, arrayFilters } = createSetNullOp(deletedIds);
                        await ReferringModel.updateMany(filter, update, { session, arrayFilters });
                        break;
                     }

                  case ON_DELETE.RESTRICT:
                     {
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
                     break;
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

// TODO: Deal with multiple elements matching on PULL or SET_NULL
// TODO: ADD github actions for publishing to NPM
// TODO: Documentation
// TODO: Add edge cases tests to check the effectiveness of the library (eg making sure it's not setting everything to null, etc);
// TODO: Add comments


module.exports = {
   Cascade,
   constants,
};