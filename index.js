
const mongoose = require('mongoose');
const DeleteRestrictedError = require('./DeleteRestrictedError');
const constants = require('./constants');
const { buildReferenceMap } = require('./utils');


const { ON_DELETE } = constants;

class Cascade {

   static constants = constants;

   /**
    * Method to delete, cascading as per schema definitions
    * @param {mongoose.Model} Model The model to delete from
    * @param {object} filter the `where` clause
    * @param {object} opts
    * @param {mongoose.ClientSession?} opts.session Provide this if the deletion needs to be part of an already started transaction
    */
   async delete(Model, filter, opts={}) {

      // initialize
      if (!this._initialized)
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
         
         if (deletedIds.length > 0) {
            // delete
            await Model.deleteMany({ _id: { $in: deletedIds }}, { session });

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

                              // this part is for your own safety
                              session.commitTransaction = () => {
                                 throw new Error(`I don't think it's a good idea to commit the transaction after "${err.name}" is thrown. You might wanna rethink some of your life choices 😜`)
                              }

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
    * Initializes the instance. Throws an error if something is wrong with your schemas
    */
   init() {
      this._refLists = buildReferenceMap(this._conn);
      this._initialized = true;
   }

   /**
    * 
    * @param {mongoose.Connection} conn The mongoose connection to use. Defaults to `mongoose.connection`
    */
   constructor(conn=mongoose.connection) {
      this._conn = conn;
   }

}

// TODO: ADD github actions for publishing to NPM
// TODO: Consider monkey patching the commitTransaction on the catch clause
// TODO: Edge case: what happens if an attribute is an array of an array, and its in this form { attribute: [ { type: [ { type: Type } ]} ]}
// TODO: Consider schemas used by defining type as Array | DocumentArray | Subdocument

module.exports = {
   Cascade,
   DeleteRestrictedError,
   constants,
};