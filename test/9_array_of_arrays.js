const { SchemaTypes } = require("mongoose");
const { makeTests } = require("./utils");

const attributeName = 'attribute';

function createReferringDocPayload(_id) {
   return {
      [attributeName]: [[ _id ]]
   }
}
function isNullSet(doc) {
   return doc[attributeName][0][0] == null;
}
function isReferencePulled(doc) {
   return doc[attributeName][0].length == 0;
}

suite("Array of arrays", function() {

   suite("{ attribute: [ [ { type: Type } ] ] }", function() {
      makeTests({
         createReferringSchemaObject({ onDelete, referredModelName }) {
            return {
               [attributeName]: [[{
                  type: SchemaTypes.ObjectId,
                  ref: referredModelName,
                  onDelete,
               }]]
            }
         },
         createReferringDocPayload,
         isNullSet,
         isReferencePulled
      });
   });

   suite("{ attribute: [ { type: [ { type: Type } ] } ] }", function() {
      makeTests({
         createReferringSchemaObject({ onDelete, referredModelName }) {
            return {
               [attributeName]: [{
                  type: [{
                     type: SchemaTypes.ObjectId,
                     ref: referredModelName,
                     onDelete,
                  }]
               }]
            }
         },
         createReferringDocPayload,
         isNullSet,
         isReferencePulled
      });
   });

});