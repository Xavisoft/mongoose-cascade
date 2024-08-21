
const mongoose = require('mongoose');
const DeleteRestrictedError = require('./DeleteRestrictedError');
const constants = require('./constants');
const { buildReferenceMap } = require('./utils');


const { ON_DELETE } = constants;

/**
 * 
 * @param {mongoose.Model} Model 
 * @param {object} filter
 * @param {object} opts
 * @param {mongoose.ClientSession|undefined} opts.session 
 */
async function cascade(Model, filter, opts={}) {

   let { session } = opts;
   const isSessionLocal = session ? false : true;

   if (isSessionLocal) {
      session = await mongoose.startSession();
      session.startTransaction();
   }

   const refLists = buildReferenceMap();

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
                  await cascade(ReferringModel, filter, { session });
                  break;

               case ON_DELETE.SET_NULL:
                  {
                     const { setNullOp } = ref;
                     const update = setNullOp || { [attribute]: null }
                     await ReferringModel.updateMany(filter, update, { session });
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
                     const update = (createPullOp && createPullOp(deletedIds)) || { $pull: { [attribute]: { $in: deletedIds }}}
                     await ReferringModel.updateMany(filter, update, { session });
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

// TODO: Deal with multiple connections
// TODO: Deal with typos in on refs
// TODO: Deal with multiple elements matching on PULL or SET_NULL
// TODO: ADD github actions for publishing to NPM
// TODO: Finalize interface
// TODO: Documentation


module.exports = {
   cascade,
   constants,
};