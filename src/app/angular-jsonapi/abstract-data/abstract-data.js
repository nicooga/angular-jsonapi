(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPIAbstractData', AngularJsonAPIAbstractDataWrapper);

  function AngularJsonAPIAbstractDataWrapper($q, $rootScope, $log, uuid4, AngularJsonAPIAbstractDataForm, lazyProperty) {

    AngularJsonAPIAbstractData.prototype.__setData = __setData;
    AngularJsonAPIAbstractData.prototype.__setLinks   = __setLinks;
    AngularJsonAPIAbstractData.prototype.__setLink = __setLink;
    AngularJsonAPIAbstractData.prototype.__validateData = __validateData;
    AngularJsonAPIAbstractData.prototype.__validateField = __validateField;
    AngularJsonAPIAbstractData.prototype.__synchronize = __synchronize;
    AngularJsonAPIAbstractData.prototype.__update = __update;

    AngularJsonAPIAbstractData.prototype.refresh = refresh;
    AngularJsonAPIAbstractData.prototype.remove = remove;
    AngularJsonAPIAbstractData.prototype.addLinkById = addLinkById;
    AngularJsonAPIAbstractData.prototype.addLink = addLink;
    AngularJsonAPIAbstractData.prototype.removeLink = removeLink;
    AngularJsonAPIAbstractData.prototype.toLink = toLink;

    AngularJsonAPIAbstractData.prototype.serialize = serialize;

    return AngularJsonAPIAbstractData;

    function AngularJsonAPIAbstractData(data) {
      var _this = this;

      _this.data = {};
      _this.links = {};

      _this.errors = {
        validation: {}
      };

      _this.dummy = data.id === undefined;

      _this.__setData(data);
      _this.__setLinks(data.links);
      _this.form = new AngularJsonAPIAbstractDataForm(_this);
    }

    function refresh() {
      var _this = this;

      _this.__synchronize('refresh');
    }

    function serialize() {
      var _this = this;

      return {
        data:angular.toJson(_this.data)
      };
    }

    function remove() {
      var _this = this;

      _this.parentCollection.remove(_this.data.id);

      _this.__synchronize('remove');
    }

    function toLink() {
      return {type: this.data.type, id: this.data.id};
    }

    function addLinkById(linkKey, linkModelName, id) {
      var _this = this;

      if (_this.linkedCollections[linkModelName] === undefined) {
        $log.error('Cannot add link of not existing type: ' + linkModelName);
        return;
      }

      if (!uuid4.validate(id)) {
        $log.error('Wrong link id, not uuid4: ' + id);
        return;
      }

      _this.addLink(
        linkKey,
        _this.linkedCollections[linkModelName].get(id)
      );

    }

    function addLink(linkKey, linkedObject) {
      var _this = this;
      var linkType;
      var reflectionType;
      var linkAttributes;

      if (_this.schema.links[linkKey] === undefined) {
        $log.error('Can\'t add link not present in schema: ', linkKey);
        return;
      }

      if (angular.isString(_this.schema.links[linkKey])) {
        linkType = _this.schema.links[linkKey];
        reflectionType = _this.schema.type;
      } else {
        linkType = _this.schema.links[linkKey].type;
        reflectionType = _this.schema.links[linkKey].reflection;
      }

      linkAttributes = _this.data.links[linkKey].linkage;

      if (linkType === 'hasOne') {
        _this.data.links[linkKey].linkage = linkedObject.toLink();
      } else {
        _this.data.links[linkKey].linkage.push(linkedObject.toLink());
      }

      _this.__synchronize('addLink');

      _this.__setLink(linkAttributes, linkKey, linkType);
    }

    function removeLink(linkKey, linkedObject, reflection) {
      var _this = this;
      var linkType;
      var linkAttributes;
      var reflectionType;
      var removed = false;

      if (_this.schema.links[linkKey] === undefined) {
        $log.error('Can\'t remove link not present in schema');
        return;
      }

      if (angular.isString(_this.schema.links[linkKey])) {
        linkType = _this.schema.links[linkKey];
        reflectionType = _this.schema.type;
      } else {
        linkType = _this.schema.links[linkKey].type;
        reflectionType = _this.schema.links[linkKey].reflection;
      }

      linkAttributes = _this.data.links[linkKey].linkage;

      if (linkType === 'hasOne') {
        if (linkedObject === undefined || linkedObject.data.id === linkAttributes.id) {
          _this.data.links[linkKey].linkage = null;
          linkAttributes = null;
          removed = true;
          if (reflection !== true) {
            _this.links[linkKey].removeLink(reflectionType, _this, true);
          }
        }
      } else {
        if (linkedObject === undefined) {
          _this.data.links[linkKey].linkage = [];
          linkAttributes = [];
          removed = true;
          if (reflection !== true) {
            angular.forEach(_this.links[linkKey], function(link) {
              link.removeLink(reflectionType, _this, true);
            });
          }
        } else {
          angular.forEach(linkAttributes, function(link, index) {
            if (link.id === linkedObject.data.id) {
              if (reflection !== true) {
                linkedObject.removeLink(reflectionType, _this, true);
              }

              linkAttributes.splice(index, 1);
              removed = true;
            }
          });
        }
      }

      if (removed === true) {
        if (reflection !== true) {
          _this.__synchronize('removeLink');
        } else {
          _this.__synchronize('removeLink reflection');
        }

        _this.__setLink(linkAttributes, linkKey, linkType);
      }
    }

    function __update(validatedData) {
      var _this = this;

      if (validatedData.id) {
        $log.error('Cannot change id of ', _this);
        delete validatedData.id;
      }

      if (validatedData.type) {
        $log.error('Cannot change type of ', _this);
        delete validatedData.type;
      }

      _this.__setData(validatedData);
      _this.__synchronize('update');
    }

    function __setLink(linkAttributes, linkKey, linkType) {
      var _this = this;

      if (linkAttributes === null) {
        delete _this.links[linkKey];
        _this.links[linkKey] = undefined;
      } else if (linkType === 'hasMany' && angular.isArray(linkAttributes)) {
        var getAll = function() {
          var result = [];
          angular.forEach(linkAttributes, function(link) {
            result.push(_this.linkedCollections[link.type].get(link.id));
          });

          return result;
        };

        lazyProperty(_this.links, linkKey, getAll);
      } else if (linkType === 'hasOne' && linkAttributes.id) {
        var getSingle = function() {
          return _this.linkedCollections[linkAttributes.type].get(linkAttributes.id);
        };

        lazyProperty(_this.links, linkKey, getSingle);
      }
    }

    function __setLinks(links) {
      var _this = this;

      angular.forEach(_this.schema.links, function(typeObj, key) {
        if (links !== undefined && links[key] !== undefined) {
          if (angular.isString(typeObj)) {
            _this.__setLink(links[key].linkage, key, typeObj);
          } else {
            _this.__setLink(links[key].linkage, key, typeObj.type);
          }
        }
      });
    }

    function __validateField(data, key) {
      var _this = this;
      var error = [];

      if (key !== 'links' && key !== 'type' && data !== undefined) {
        error = __validate(_this.schema[key], data, key);
      }

      return error;
    }

    function __validateData(data) {
      var _this = this;
      var errors = {};

      angular.forEach(_this.schema, function(validator, key) {
        var error = _this.__validateField(data[key], key);
        if (error.length > 0) {
          errors[key] = error;
          $log.warn('Erorrs when validating ', data[key], errors);
        }
      });

      return errors;
    }

    function __setData(data) {
      var _this = this;
      var safeData = angular.copy(data);
      _this.errors.validation = _this.__validateData(data);

      safeData.links = safeData.links || {};
      angular.forEach(_this.schema.links, function(type, key) {
        if (type === 'hasOne') {
          safeData.links[key] = safeData.links[key] || null;
        } else {
          safeData.links[key] = safeData.links[key] || [];
        }
      });

      angular.forEach(_this.schema, function(validator, key) {
        if (data[key]) {
          _this.data[key] = safeData[key];
        }
      });
    }

    // todo refactor, enable arrays of validators and validators as objects like {maxlength: 3}
    function __validate(validator, value, key) {
      var errors = [];
      if (angular.isArray(validator)) {
        angular.forEach(validator, function(element) {
          errors = errors.concat(__validate(element, value, key));
        });
      } else if (angular.isFunction(validator)) {
        var err = validator(value);
        if (angular.isArray(err)) {
          errors.concat(err);
        } else {
          $log.error(
            'Wrong validator type it should return array of errors instead of: ' +
              err.toString()
          );
        }
      } else if (angular.isString(validator)) {
        if (validator === 'text' || validator === 'string') {
          if (!angular.isString(value)) {
            errors.push(key + ' is not a string ');
          }
        } else if (validator === 'number' || validator === 'integer') {
          if (parseInt(value).toString() !== value.toString()) {
            errors.push(key + ' is not a number');
          }
        } else if (validator === 'uuid4') {
          if (!uuid4.validate(value)) {
            errors.push(key + ' is not a uuid4');
          }
        } else if (validator === 'required') {
          if (value.toString().length === 0) {
            errors.push(key + ' is empty');
          }
        } else {
          $log.error('Wrong validator type: ' + validator.toString());
        }
      } else {
        $log.error('Wrong validator type: ' + validator.toString());
      }

      return errors;
    }

    function __synchronize(key, synchronizationHooks) {
      $log.log('Synchro', key, synchronizationHooks);
    }

  }
})();