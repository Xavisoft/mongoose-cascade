
const { default: mongoose } = require("mongoose");
const { makeTests } = require("./utils");


suite("Unnested attribute", function () {

   const attributeName = 'attribute'
   
   makeTests({
      createReferringDocPayload(_id) {
         return { [attributeName]: _id }
      },
      createReferringSchemaObject({ referredModelName, onDelete }) {
         return {
            [attributeName]: {
               type: mongoose.Types.ObjectId,
               ref: referredModelName,
               onDelete,
            }
         }
      },
      isNullSet(doc) {
         return !doc[attributeName]
      },
   })
});