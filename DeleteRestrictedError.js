const { default: mongoose } = require("mongoose");

module.exports = class DeleteRestrictedError extends mongoose.MongooseError {
   
   name = 'DeleteRestrictedError'

   /**
    * 
    * @param {mongoose.Model} restrictedModel 
    * @param {Array<mongoose.ObjectId>} restrictedIds 
    * @param {mongoose.Model} restrictingModel 
    */
   constructor(restrictedModel, restrictedIds, restrictingModel) {
      super();
      this.restrictedModel = restrictedModel;
      this.restrictedIds = restrictedIds;
      this.restrictingModel = restrictingModel
      this.message = `At least one of ${restrictedModel.modelName} { _ids: [ ${restrictedIds.join(', ') } ] }: is still referenced in ${restrictingModel.modelName} collection`
   }
}
