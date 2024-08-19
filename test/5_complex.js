const casual = require("casual");
const { makeTests } = require("./utils");
const { default: mongoose } = require("mongoose");

suite('Complex', function() {

   const levels = casual.integer(3, 5);
   const TYPES = {
      ARRAY: 'array',
      NOT_ARRAY: 'not-array',
   }

   const pattern = [];
   for (let i = 0; i < levels; i++) {
      pattern.push({
         type: casual.random_element(Object.values(TYPES)),
         name: casual.word.toLowerCase(),
      });
   }

   const reversedPattern = [ ...pattern ].reverse();

   makeTests({
      createReferringSchemaObject({ onDelete, referredModelName }) {
         let schema;
         const [ { type, name } ] = reversedPattern;

         if (type === TYPES.ARRAY) {
            // TODO: randomly choose schema style
            schema = {
               [name]: {
                  type: [ mongoose.SchemaTypes.ObjectId ],
                  ref: referredModelName,
                  onDelete,
               }
            }
         } else {
            // TODO: randomly choose schema style
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
               // TODO: randomly choose schema style
               schema = {
                  [name]: {
                     type: [ schema ],
                  }
               }
            } else {
               // TODO: randomly choose schema style
               schema = {
                  [name]: schema,
               }
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

      }
   });
});