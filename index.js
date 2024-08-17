
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

            const { onDelete, model, attribute } = ref;

            const filter = {
               [attribute]: {
                  $in: deletedIds
               }
            }; // the filter targets every doc that reference the deleted docs
            
            switch (onDelete) {
               case ON_DELETE.CASCADE:
                  await cascade(model, filter, { session });
                  break;

               case ON_DELETE.SET_NULL:
                  {
                     const update = { [attribute]: null }
                     await model.updateMany(filter, update, { session });
                     break;
                  }

               case ON_DELETE.RESTRICT:
                  {
                     const count = await model.countDocuments(filter, { session });

                     if (count > 0) {
                        const err = new DeleteRestrictedError(Model, deletedIds, model);
                        err.code = ON_DELETE.RESTRICT;
                        throw err;
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
         session.endSession();
   }
}

module.exports = {
   cascade,
   constants,
};