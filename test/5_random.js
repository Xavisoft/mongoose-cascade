const casual = require("casual");
const { makeTests } = require("./utils");
const { default: mongoose } = require("mongoose");

suite('Random schemas', function() {

   const TYPES = {
      ARRAY: 'array',
      NOT_ARRAY: 'not-array',
   }

   const levels = casual.integer(5, 7);
   const pattern = [];

   for (let i = 0; i < levels; i++) {
      pattern.push({
         type: casual.random_element(Object.values(TYPES)),
         name: casual.word.toLowerCase(),
      });
   }

   const reversedPattern = [ ...pattern ].reverse();

   let isReferencePulled;

   if (pattern.some(item => item.type === TYPES.ARRAY)) {
      
      isReferencePulled = doc => {

         // find the last array index
         let lastIndexOfArrayAttribute = 0;
         for (let i = 0; i < pattern.length; i++) {
            if (pattern[i].type == TYPES.ARRAY)
               lastIndexOfArrayAttribute = i;;
         }

         let arr = doc;

         for (let i = 0; i < lastIndexOfArrayAttribute; i++) {
            const { type, name } = pattern[i];
            arr = arr[name];
            if (type === TYPES.ARRAY)
               arr = arr[0];
         }

         arr = arr[pattern[lastIndexOfArrayAttribute].name];
         return arr.length === 0;
         
      }
   }

   makeTests({
      createReferringSchemaObject({ onDelete, referredModelName }) {
         let schema;
         const [ { type, name } ] = reversedPattern;

         if (type === TYPES.ARRAY) {
            let value;

            if (casual.coin_flip) {
               value = {
                  type: [ mongoose.SchemaTypes.ObjectId ],
                  ref: referredModelName,
                  onDelete,
               }
            } else {
               value = [{
                  type: mongoose.SchemaTypes.ObjectId,
                  ref: referredModelName,
                  onDelete,
               }]
            }

            schema = { [name]: value }
         } else {
            schema = {
               [name]: {
                  type: mongoose.SchemaTypes.ObjectId,
                  ref: referredModelName,
                  onDelete,
               }
            }
         }

         for (let i = 1; i < reversedPattern.length; i++) {
            const { type, name } = reversedPattern[i];
            if (type === TYPES.ARRAY) {
               let value;

               if (casual.coin_flip) {
                  value = {
                     type: [ schema ],
                  }
               } else {
                  value = [ schema ]
               }

               schema = { [name]: value }
            } else {
               schema = { [name]: schema, }
            }
         }

         return schema;

      },
      createReferringDocPayload(_id) {
         let payload;

         const [ { name, type }] = reversedPattern;

         if (type === TYPES.ARRAY) {
            payload = { [name]: [ _id ] }
         } else {
            payload = { [name]: _id }
         }

         for (let i = 1; i < reversedPattern.length; i++) {
            const { type, name } = reversedPattern[i];

            if (type === TYPES.ARRAY) {
               payload = {
                  [name]: [ payload ]
               }
            } else {
               payload = { [name]: payload }
            }
         }

         return payload;
      },
      isNullSet(doc) {

         let shouldBeNull = doc;

         for (let i in pattern) {
            const { type, name } = pattern[i];
            shouldBeNull = shouldBeNull[name];
            if (type === TYPES.ARRAY)
               shouldBeNull = shouldBeNull[0];
         }

         return shouldBeNull === null;

      },
      isReferencePulled,
   });
});