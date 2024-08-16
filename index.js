

const mongoose = require('mongoose');


const ON_DELETE = {
   SET_NULL: 'set_null',
   CASCADE: 'cascade',
   RESTRICT: 'restrict',
}


class DeleteRestrictedError extends mongoose.MongooseError {
   /**
    * 
    * @param {mongoose.Model} restrictedModel 
    * @param {Array<mongoose.ObjectId>} restrictedIds 
    * @param {mongoose.Model} restrictingModel 
    */
   constructor(restrictedModel, restrictedIds, restrictingModel) {
      super();
      this.restrictedModel = restrictedModel;
      this.restrictedIds = restrictedIds;
      this.restrictingModel = restrictingModel
      this.message = `At least one of ${restrictedModel.modelName} { _ids: [ ${restrictedIds.join(', ') } ] }: is still referenced in ${restrictingModel.modelName} collection`
   }
}

let _refLists;

/**
 * 
 * @param {mongoose} mongoose
 * @returns {Object<string,Array<{
 *    model: mongoose.Model,
 *    attribute: string,
 *    onDelete: string,
 * }>}
 * }
 */
function buildReferenceMap(mongoose) {

   if (_refLists)
      return _refLists;

   const refLists = {};

   mongoose.modelNames().forEach(modelName => {
      const Model = mongoose.model(modelName);
      const schema = Model.schema.obj;

      Object.keys(schema).forEach(attribute => {

         // check if this attribute is a reference
         let obj = schema[attribute];

         // TODO: this might now work everytime
         if (Array.isArray(obj))
            obj = obj[0];

         if (typeof obj !== 'object') // can't have ref
            return;
         
         const refModelName = obj.ref;
         if (!refModelName)
            return;

         const { onDelete } = obj;
         if (!onDelete)
            return;

         // record reference
         let refList = refLists[refModelName];

         if (!refList) {
            refList = [];
            refLists[refModelName] = refList;
         }

         refList.push({
            model: Model,
            attribute,
            onDelete,
         });


      })
   });

   // check if any config is missed
   let configuredCount = 0;

   for (const key in refLists)
      configuredCount += refLists[key].length;

   const expectedCount = _countRefs(mongoose);

   if (configuredCount < expectedCount) {
      const message = 'This error is because the developer overlooked at least 1 way of defining a attributes in schema. Please try to be as verbose as possible to make this error go away';
      throw new Error(message);
   } else if (configuredCount > expectedCount) {
      throw new Error('This should not happen. I messed up.');
   }

   _refLists = refLists;
   return refLists;

}

/**
 * 
 * @param {mongoose} mongoose 
 */
function _countRefs(mongoose) {

   function countSchemaRefs(obj) {
      let count = 0;

      if (typeof obj === 'object') {
         if (Array.isArray(obj)) {
            obj.forEach(item => {
               count += countSchemaRefs(item)
            });
         } else {
            if (obj.ref && obj.onDelete) {
               count +=1
            } else {
               for (const key in obj) {
                  count += countSchemaRefs(obj[key]);
               }
            }
         }
      }

      return count;
   }

   let count = 0;

   mongoose.modelNames().forEach(name => {
      const model = mongoose.models[name];
      count += countSchemaRefs(model.schema.obj)
   });

   return count;

}

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

   const refLists = buildReferenceMap(mongoose);

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

                  const update = { [attribute]: null }
                  await model.updateMany(filter, update, { session });

                  break;

               case ON_DELETE.RESTRICT:

                  const count = await model.countDocuments(filter, { session });

                  if (count > 0) {
                     const err = new DeleteRestrictedError(Model, deletedIds, model);
                     err.code = ON_DELETE.RESTRICT;
                     throw err;
                  }

                  break;
            
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

module.exports = cascade;

cascade.ON_DELETE = ON_DELETE;