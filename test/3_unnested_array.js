
const { default: mongoose } = require("mongoose");
const { makeTests } = require("./utils");


const attributeName = 'attribute';

function createReferringDocPayload(_id) {
   return { [attributeName]: [ _id ] }
}

function isNullSet(doc) {
   return doc[attributeName][0] === null
}

function isReferencePulled(doc) {
   return doc[attributeName].length === 0;
}

suite("Unnested array", function () {


   suite("[ { type: Type } ] schema definition", function() {
   
      makeTests({
         createReferringDocPayload,
         createReferringSchemaObject({ referredModelName, onDelete }) {
            return {
               [attributeName]: [{
                  type: mongoose.Types.ObjectId,
                  ref: referredModelName,
                  required: true,
                  onDelete,
               }]
            }
         },
         isNullSet,
         isReferencePulled,
      });

   });

   suite("{ type: [ Type ] } schema definition", function() {
   
      makeTests({
         createReferringDocPayload,
         createReferringSchemaObject({ referredModelName, onDelete }) {
            return {
               [attributeName]: {
                  type: [ mongoose.Types.ObjectId ],
                  ref: referredModelName,
                  required: true,
                  default: [],
                  onDelete,
               }
            }
         },
         isNullSet,
         isReferencePulled,
      });

   });
   
});