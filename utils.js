
/** 
 * @callback createOpCallback
 * @param {Array<import('mongoose').Schema.Types.ObjectId>} filter
 * @returns {object}
 */

const { ON_DELETE } = require('./constants');

/**
 * 
 * @param {import('mongoose').Connection} conn
 * @returns {Object<string,Array<{
 *    model: import('mongoose').Model,
 *    attribute: string,
 *    onDelete: string,
 *    createSetNullOp: createOpCallback | undefined,
 *    createPullOp: createOpCallback | undefined,
 *    createFilter: createOpCallback | undefined
 * }>}
 * }
 */
function buildReferenceMap(conn) {

   // build reference list
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

      if (typeof obj !== 'object') 
         return; // can't have ref

      let newPath = [ ...path ];

      const dealWithMultiDimensionalArrays = obj => {
         // TODO: revise this function
         while (Array.isArray(obj)) {
            newPath.push({ isArray: true });
            obj = obj[0];

            if (Array.isArray(obj.type)) {
               if (typeof obj.type[0] !== 'function')
                  obj = obj.type[0];
               newPath.push({ isArray: true })
            }
         }

         if (Array.isArray(obj.type)) {
            obj = obj.type[0];
            newPath.push({ isArray: true })
            obj = dealWithMultiDimensionalArrays(obj);
         }

         return obj;
      }

      if (Array.isArray(obj)) {
         // embedded array
         obj = obj[0];
         newPath.push({ attribute, isArray: true });

         // deal with multidimensional arrays
         obj = dealWithMultiDimensionalArrays(obj);
         
      } else if (Array.isArray(obj.type)) {
         // embedded array
         newPath.push({ attribute, isArray: true });

         if (typeof obj.type[0] === 'function') {
            // no rabbit hole and ref could be on {obj}
         } else {
            // definitely a rabbit hole
            obj = obj.type[0];

            // deal with multidimensional arrays
            obj = dealWithMultiDimensionalArrays(obj);
         }

      } else if (typeof obj.type === 'function') {
         // flat
         newPath.push({ attribute, isArray: false });
      } else {
         // embedded object
         newPath.push({ attribute, isArray: false });

         if (typeof obj.type === 'object') {
            return processSchemaForRefs(obj.type, refLists, Model, newPath);
         }
      }


      if (typeof obj !== 'object') 
         return; // can't have ref
      
      const refModelName = obj.ref;
      if (!refModelName) {
         if (typeof obj.type === 'function')
            return;
         // recursively deal with the schema
         obj = obj.type || obj;
         return processSchemaForRefs(obj, refLists, Model, newPath);
      }

      const { onDelete } = obj;
      if (!onDelete)
         return;

      // record reference
      /// function to create operation for pulling array elements
      let createPullOp;

      if (onDelete === ON_DELETE.PULL) {
         // TODO: Explain here

         let lastIndexOfArrayAttribute;
         for (let i = 0; i < newPath.length; i++) {
            if (newPath[i].isArray)
               lastIndexOfArrayAttribute = i;
         }

         createPullOp = _ids => {

            if (lastIndexOfArrayAttribute === undefined)
               return {};

            const pathUpToLastArray = newPath.slice(0, lastIndexOfArrayAttribute);
            const pathAfterLastArray = newPath.slice(lastIndexOfArrayAttribute + 1);
            const lastArrayAttribute = newPath[lastIndexOfArrayAttribute].attribute;
            let strPathUpToLastArray;

            if (pathUpToLastArray.length) {
               strPathUpToLastArray = generateAttributePath(pathUpToLastArray);
               if (lastArrayAttribute)
                  strPathUpToLastArray += `.${lastArrayAttribute}`;
            } else {
               strPathUpToLastArray = lastArrayAttribute;
            }
            
            const strPathAfterLastArray = generateAttributePath(pathAfterLastArray);

            const $in = _ids
            const filter = strPathAfterLastArray ? { [strPathAfterLastArray]: { $in } } : { $in }
            
            return {
               $pull: {
                  [strPathUpToLastArray]: filter,
               }
            }
         }
         
      }

      /// function to create operation for setting reference to null
      let createSetNullOp;

      if (onDelete === ON_DELETE.SET_NULL) {
         // TODO: Explain here
         createSetNullOp = _ids => {

            // array filters
            const arr = [];
            let gotArray = false;
            const reversedPath = [ ...newPath ].reverse();

            for (const item of reversedPath) {
               if (item.isArray) {
                  gotArray = true;
                  break;
               }
               arr.unshift(item.attribute);
            }

            const arrayFilters = [];
            const ARRAY_FILTER_IDENTIFIER = 'elem';

            if (gotArray) {
               const path = [ ARRAY_FILTER_IDENTIFIER, ...arr ].join('.');
               arrayFilters.push({ [path]: { $in: _ids } })
            }

            // set operator
            let path;
            const strPath = generateAttributePath(newPath);

            if (gotArray) {
               const $BRACES = '$[]';
               const lastIndexOf$Braces = strPath.lastIndexOf($BRACES);
               path = strPath.substring(0, lastIndexOf$Braces) + `$[${ARRAY_FILTER_IDENTIFIER}]` + strPath.substring(lastIndexOf$Braces + $BRACES.length);
            } else {
               path = strPath;
            }

            const update = {
               [path]: null
            }

            return { arrayFilters, update }

         }
      }

      /// function to create the where clause to target docs refereing to the deleted docs
      let createFilter;

      if (newPath.some(item => item.isArray)) {
         createFilter = _ids => {

            let filter;
            const reversedPath = [ ...newPath ].reverse();

            const { attribute, isArray } = reversedPath[0];
            const value = { $in: _ids };

            if (isArray) {
               if (attribute) {
                  filter = { [attribute]: { $elemMatch: value } }
               } else {
                  filter = { $elemMatch: value }
               }
            } else {
               filter = { [attribute]: value }
            }

            for (let i = 1; i < reversedPath.length; i++) {
               const { attribute, isArray } = reversedPath[i];

               if (isArray) {
                  if (attribute) {
                     filter = {
                        [attribute]: { $elemMatch: filter }
                     }
                  } else {
                     filter = { $elemMatch: filter }
                  }
               } else {
                  const key = Object.keys(filter)[0];
                  const value = filter[key];
                  filter = { [`${attribute}.${key}`]: value }
               }
            }

            return filter;
         }

      }

      /// add to lists
      let refList = refLists[refModelName];

      if (!refList) {
         refList = [];
         refLists[refModelName] = refList;
      }

      refList.push({
         model: Model,
         attribute: newPath
            .map(item => item.attribute)
            .join('.'),
         onDelete,
         createSetNullOp,
         createPullOp,
         createFilter,
      });

   })
}

function generateAttributePath(path) {
   return path
      .map(({ attribute, isArray }) => {
         if (!isArray)
            return attribute;
         if (!attribute)
            return `$[]`;
         return `${attribute}.$[]`;
      })
      .join('.');
}


/**
 * 
 * @param {import('mongoose').Connection} conn 
 * @returns 
 */
function _countRefs(conn) {

   function countSchemaRefs(obj) {
      let count = 0;

      // recursively count all objects where ref and onDelete are available
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


   // count refs on each model
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