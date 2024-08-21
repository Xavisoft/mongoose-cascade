
/** 
 * @callback pullOpCallback
 * @param {Array<import('mongoose').Schema.Types.ObjectId>} filter
 * @returns {object}
 */

/**
 * 
 * @param {import('mongoose').Connection} conn
 * @returns {Object<string,Array<{
 *    model: import('mongoose').Model,
 *    attribute: string,
 *    onDelete: string,
 *    setNullOp: object | undefined,
 *    createPullOp: pullOpCallback | undefined
 * }>}
 * }
 */
function buildReferenceMap(conn) {

   const refLists = {};

   conn.modelNames().forEach(modelName => {
      const Model = conn.model(modelName);
      const schema = Model.schema.obj;
      processSchemaForRefs(schema, refLists, Model);
   });

   // check if any config is missed
   let configuredCount = 0;

   for (const key in refLists)
      configuredCount += refLists[key].length;

   const expectedCount = _countRefs(conn);

   if (configuredCount < expectedCount) {
      const message = 'This error is because the developer overlooked at least 1 way of defining a attributes in schema. Please try to be as verbose as possible to make this error go away';
      throw new Error(message);
   } else if (configuredCount > expectedCount) {
      throw new Error('This should not happen. I messed up.');
   }

   return refLists;

}


function processSchemaForRefs(schema, refLists, Model, path=[]) {
   Object.keys(schema).forEach(attribute => {

      // check if this attribute is a reference
      let obj = schema[attribute];

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

      let setNullOp, createPullOp;
      if (isArray) {
         setNullOp = {
            [`${strPath}.$`]: null,
         };

         createPullOp = _ids => {
            return {
               $pull: {
                  [strPath]: {
                     $in: _ids
                  }
               }
            }
         }
         
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
         setNullOp,
         createPullOp,
      });

   })
}


/**
 * 
 * @param {import('mongoose').Connection} conn 
 * @returns 
 */
function _countRefs(conn) {

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

   conn.modelNames().forEach(name => {
      const model = conn.models[name];
      count += countSchemaRefs(model.schema.obj)
   });

   return count;

}

module.exports = {
   buildReferenceMap,
}