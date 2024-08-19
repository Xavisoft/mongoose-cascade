const { default: mongoose } = require("mongoose");
const { makeTests } = require("./utils");


const attributeName = "attribute";
const childAttributeName = "child";

function createReferringDocPayload(_id) {
   return {
      [attributeName]: {
         [childAttributeName]: _id,
      }
   }
}

function isNullSet(doc) {
   return doc[attributeName][childAttributeName] == null;
}


suite("Nested attribute", function() {
   
   suite('{ attribute: { attribute: { type: Type } } }', function() {
      makeTests({
         createReferringSchemaObject({ onDelete, referredModelName }) {
            return {
               [attributeName]: {
                  [childAttributeName]: {
                     type: mongoose.Schema.Types.ObjectId,
                     ref: referredModelName,
                     onDelete,
                     required: true,
                  }
               }
            }
         },
         createReferringDocPayload,
         isNullSet,
      });
   });

   suite('{ attribute: { type: { attribute: { type: Type } } } }', function() {
      makeTests({
         createReferringSchemaObject({ onDelete, referredModelName }) {
            return {
               [attributeName]: {
                  type: {
                     [childAttributeName]: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: referredModelName,
                        onDelete,
                        required: true,
                     }
                  },
                  required: true,
               }
            }
         },
         createReferringDocPayload,
         isNullSet,
      });
   });
});