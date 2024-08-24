
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
 *    createPullOp: createOpCallback | undefined
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

      const newPath = [ ...path, { attribute, isArray } ];
      
      const refModelName = obj.ref;
      if (!refModelName) {
         let schema;

         if (obj.type) {
            if (Array.isArray(obj.type))
               schema = obj.type[0];
            else
               schema = obj.type;
         } else {
            schema = obj;
         }
         
         return processSchemaForRefs(schema, refLists, Model, newPath);
      }

      const { onDelete } = obj;
      if (!onDelete)
         return;

      // record reference
      /// function to create operation for pulling array elements
      let createPullOp;

      if (onDelete === ON_DELETE.PULL) {
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
            const strPathUpToLastArray = pathUpToLastArray.length ? generateAttributePath(pathUpToLastArray) + `.${lastArrayAttribute}` : lastArrayAttribute;
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
      });

   })
}

function generateAttributePath(path) {
   return path
      .map(({ attribute, isArray }) => {
         if (!isArray)
            return attribute;
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