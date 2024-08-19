const { default: mongoose } = require("mongoose");

let _refLists;

/**
 * 
 * @returns {Object<string,Array<{
 *    model: mongoose.Model,
 *    attribute: string,
 *    onDelete: string,
 *    setNullOp: object | undefined,
 * }>}
 * }
 */
function buildReferenceMap(force=false) {

   if (!force && _refLists)
      return _refLists;

   const refLists = {};

   mongoose.modelNames().forEach(modelName => {
      const Model = mongoose.model(modelName);
      const schema = Model.schema.obj;
      processSchemaForRefs(schema, refLists, Model);
   });

   // check if any config is missed
   let configuredCount = 0;

   for (const key in refLists)
      configuredCount += refLists[key].length;

   const expectedCount = _countRefs();

   if (configuredCount < expectedCount) {
      const message = 'This error is because the developer overlooked at least 1 way of defining a attributes in schema. Please try to be as verbose as possible to make this error go away';
      throw new Error(message);
   } else if (configuredCount > expectedCount) {
      throw new Error('This should not happen. I messed up.');
   }

   _refLists = refLists;
   return refLists;

}


function processSchemaForRefs(schema, refLists, Model, path=[]) {
   Object.keys(schema).forEach(attribute => {

      // check if this attribute is a reference
      let obj = schema[attribute];

      // TODO: this might now work everytime
      let isArray = false;
      if (Array.isArray(obj)) {
         obj = obj[0];
         isArray = true;
      }

      if (typeof obj !== 'object') // can't have ref
         return;

      if (Array.isArray(obj.type))
         isArray = true;

      path.push(attribute);
      const strPath = path.join('.');

      let setNullOp;
      if (isArray) {
         setNullOp = {
            [`${strPath}.$`]: null,
         };
      }
      
      const refModelName = obj.ref;
      if (!refModelName) {
         const schema = obj.type || obj;
         processSchemaForRefs(schema, refLists, Model, path);
         return;
      }

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
         attribute: strPath,
         onDelete,
         setNullOp
      });

   })
}


function _countRefs() {

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

module.exports = {
   buildReferenceMap,
}