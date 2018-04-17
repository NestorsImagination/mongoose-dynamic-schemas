'use strict';

const objectPath = require("object-path");

/**
 * Adds the given field to the Mongoose model at the end of the path.
 * @param {object} model The Mongoose model.
 * @param {string} path The path where the field will be added (sucessive fields separated with points, even when a 
 * nested field is inside an array/subdocument)
 * @param {object} fieldDefinition The definition of the field to add, including options and other nested fields or
 * arrays/subdocuments.
 * @returns {Promise} Results of the operation.
 */
function addSchemaField(model, path, fieldDefinition, callback) {
	return new Promise(function (resolve, reject) {
		var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

		if (lastSchemaAndPaths.exists) {
			reject("The field to add already exists (" + path + ")");
		} else {
			var addQuery = {};
			objectPath.set(addQuery, lastSchemaAndPaths.path, fieldDefinition);

			lastSchemaAndPaths.schema.add(addQuery);

			// Updates all the subdocument schema trees
			for (var currentSchema = model.schema; lastSchemaAndPaths.subPaths.length > 1; currentSchema = currentSchema.path(lastSchemaAndPaths.subPaths[0]).schema, lastSchemaAndPaths.subPaths.shift()) {
				objectPath.set (currentSchema.tree, lastSchemaAndPaths.subPaths.join('.0.'), fieldDefinition);
			}

			resolve("Field added successfully");
		}
	});
}

/**
 * Removes the field of the Mongoose model at the end of the path.
 * @param {object} model The Mongoose model.
 * @param {string} path The path of the field to remove (sucessive fields separated with points, even when a nested 
 * field is inside an array/subdocument).
 * @returns {Promise} Results of the operation.
 */
function removeSchemaField(model, path, callback) {
	return new Promise(function (resolve, reject) {
		var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

		if (!lastSchemaAndPaths.exists) {
			reject("The field to remove does not exists (" + path + ")");
		} else {
			var unsetQuery = {};
			unsetQuery[lastSchemaAndPaths.fullPath] = 1;

			var updateQuery = {};
			if (lastSchemaAndPaths.pathToLast != "")
				updateQuery[lastSchemaAndPaths.pathToLast] = { $gt: [] };

			model.update(updateQuery, { $unset: unsetQuery }, { multi: true, upsert: false })
			.then(function () {
				model.schema.remove(lastSchemaAndPaths.fullPath);
				lastSchemaAndPaths.schema.remove(lastSchemaAndPaths.path);

				for (var currentSchema = model.schema; lastSchemaAndPaths.subPaths.length > 1; currentSchema = currentSchema.path(lastSchemaAndPaths.subPaths[0]).schema, lastSchemaAndPaths.subPaths.shift()) {
					objectPath.del (currentSchema.tree, lastSchemaAndPaths.subPaths.join('.0.'));
				}

				resolve("Field removed successfully");
			})
			.catch(error => reject(error));
		}
	});
}

/**
 * Moves (or renames) the field at the origin path to a new field at the destination path.
 * 
 * The origin path must point to an existing field. The destination path must point to a non existing field in the same
 * array/subdocument level of the field at the origin path.
 * 
 * The new field will keep the values the original field had, even at subdocument levels.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} origin The path of the field to move (sucessive fields separated with points, even when a nested 
 * field is inside an array/subdocument).
 * @param {string} dest The destination path of the field to move (sucessive fields separated with points, even 
 * when a nested field is inside an array/subdocument).
 * @returns {Promise} Results of the operation.
 */
function moveSchemaField(model, origin, dest, callback) {
	return new Promise(function (resolve, reject) {
		var lastSchemaAndPathsOrigin = getLastSchemaAndPaths(model.schema, origin);
		var lastSchemaAndPathsDest = getLastSchemaAndPaths(model.schema, dest);

		if (!lastSchemaAndPathsOrigin.exists) {
			reject("Origin path does not exists (" + origin + ")");
		} else if (lastSchemaAndPathsDest.exists) {
			reject("Destination path already exists (" + dest + ")");
		} else if (lastSchemaAndPathsOrigin.subPaths.length != lastSchemaAndPathsDest.subPaths.length) {
			reject("Origin and destination paths must refer to the same subdocument");
		} else {
			var sameSubocument = true;

			for (var i = 0; i < lastSchemaAndPathsOrigin.subPaths.length - 1; i++) {
				if (lastSchemaAndPathsOrigin.subPaths[i] !== lastSchemaAndPathsDest.subPaths[i])
					sameSubocument = false;
			}

			if (!sameSubocument) {
				reject("Origin and destination paths must refer to the same subdocument");
			} else {
				var fieldDefinition = objectPath.get(
					lastSchemaAndPathsOrigin.schema.tree, 
					lastSchemaAndPathsOrigin.path
				);

				addSchemaField(model, dest, fieldDefinition)
				.then(result => model.find({}).exec())
				.then(function (docs) {
					var numToUpdate = docs.length;
					var numUpdated = 0;

					docs.forEach(function (doc) {
						moveForAllSubdocuments(doc, lastSchemaAndPathsOrigin.subPaths, lastSchemaAndPathsDest.path);
						doc.markModified(lastSchemaAndPathsOrigin.subPaths[0]);

						doc.save(function (err) {
							if (err) reject(err);
							numUpdated++;

							if (numUpdated == numToUpdate) {
								removeSchemaField(model, origin)
								.then(resolve("Field moved successfully"))
								.catch(error => reject(error));
							}
						});
					});
				})
				.catch(error => reject(error));
			}
		}
	});
}

/**
 * Changes the definition of the field at the given path.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} path The path to the field whose definition will be changed (sucessive fields separated with points, 
 * even when a nested field is inside an array/subdocument).
 * @param {object} newDefinition The new definition of the field (same structure as standard Mongoose schema field 
 * definitions).
 * @returns {Promise} Results of the operation.
 */
function changeFieldDefinition(model, path, newDefinition) {
	return new Promise(function (resolve, reject) {
		var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

		if (!lastSchemaAndPaths.exists)
			reject("The path does not point to an existing field (" + path + ")");

		var fieldDefinition = {};

		objectPath.set(fieldDefinition, lastSchemaAndPaths.path, newDefinition);

		removeSchemaField(model, path)
		.then(result => addSchemaField(model, path, newDefinition))
		.then(result => resolve("Field definition modified"))
		.catch(error => reject(error));
	});
}

/**
 * Alternative function to change a field's type, more limited than changeFieldDefinition.
 * 
 * @param {*} model The Mongoose model.
 * @param {*} path The path of the field whose type will be changed (sucessive fields separated with points, even when a 
 * nested field is inside an array/subdocument).
 * @param {*} newType The new type of the field (String, Number...).
 * @param {*} defaultValue The default value of the field. If undefined, no default value will be defined for the field.
 * @param {*} required If the field is required or not. If undefined, it will be tagged as not required.
 * @returns {Promise} Results of the operation.
 */
function changeFieldType(model, path, newType, defaultValue, required) {
	return new Promise(function (resolve, reject) {
		var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

		if (!lastSchemaAndPaths.exists)
			reject("The path does not point to an existing field (" + path + ")");

		var fieldDefinition = {};

		objectPath.set (fieldDefinition, lastSchemaAndPaths.path, objectPath.get (lastSchemaAndPaths.schema.tree, lastSchemaAndPaths.path));

		var fieldDefinitionSuper = objectPath.get (fieldDefinition, lastSchemaAndPaths.path);
		fieldDefinitionSuper.type = newType;
		if (defaultValue != undefined)
			fieldDefinitionSuper.default = defaultValue;
		else
			delete fieldDefinitionSuper.default;

		if (required != undefined)
			fieldDefinitionSuper.required = required;
		else
			delete fieldDefinitionSuper.required;
		
		lastSchemaAndPaths.schema.remove(lastSchemaAndPaths.path);
		lastSchemaAndPaths.schema.add(fieldDefinition);

		resolve("Field type changed");
	});
}

// Utilities

/**
 * Moves the value of the fields at the end of the subPaths array to the field at lastDestPath in the same subdocument 
 * level, doing this for all instances of that field in the case it is contained inside one or multiple arrays.
 * 
 * @param {object} doc The document.
 * @param {array} subPaths Subpaths that point to the field whose value will be moved.
 * @param {string} lastDestPath Path inside the same subdocument level of the other field where the value will be moved.
 */
function moveForAllSubdocuments(doc, subPaths, lastDestPath) {
	moveForAllSubdocumentsRecursive(doc, subPaths, lastDestPath, 0);
}

/**
 * Recursive function used by moveForAllSubdocuments.
 * 
 * @param {object} doc The document.
 * @param {array} subPaths Subpaths that point to the field whose value will be moved.
 * @param {string} lastDestPath Path inside the same subdocument level of the other field where the value will be moved.
 * @param {Number} currentPathIndex The current index of the subdocument levels to explore.
 */
function moveForAllSubdocumentsRecursive(doc, subPaths, lastDestPath, currentPathIndex) {
	if (currentPathIndex == (subPaths.length - 1)) {
		objectPath.set(doc._doc, lastDestPath, objectPath.get(doc._doc, subPaths[currentPathIndex]))
	} else {
		objectPath.get(doc._doc, subPaths[currentPathIndex]).forEach(function (subDoc) {
			moveForAllSubdocumentsRecursive(subDoc, subPaths, lastDestPath, currentPathIndex + 1);
		});
	}
}

/**
 * Returns an object containing useful information given an schema and a path. The fields contained are:
 * 
 * - exists: If the path points to an existing field.
 * - schema: The schema of the subdocument the path is pointing to.
 * - path: The path to the pointed location inside its own subdocument.
 * - fullPath: The full path, where a ".$[]" symbol has been added for each array found (useful for queries).
 * - pathToLast: The path that points to the last array found, the subdocument level where the given path points to.
 * - subPaths: Array of paths, where each subpath points to the next array or, for the last subpath, to the location the
 * given path points inside its own subdocument.
 * 
 * @param {*} schema The schema to explore.
 * @param {*} path The path to the field.
 * @returns {object} Object containing all the utility data.
 */
function getLastSchemaAndPaths(schema, path) {
	return getLastSchemaAndPathsRecursive(schema, path.split('.'), 0, "", []);
}

/**
 * Returns an object containing useful information given an schema and a path. The fields contained are:
 * 
 * - exists: If the path points to an existing field.
 * - schema: The schema of the subdocument the path is pointing to.
 * - path: The path to the pointed location inside its own subdocument.
 * - fullPath: The full path, where a ".$[]" symbol has been added for each array found (useful for queries).
 * - pathToLast: The path that points to the last array found, the subdocument level where the given path points to.
 * 
 * @param {*} schema The schema to explore.
 * @param {*} path The path to the field.
 * @param {*} currentPathIndex The current index of the subpaths to explore.
 * @param {*} currentFullPath The current full path.
 * @param {*} subPaths The array of subpaths. 
 * @returns {object} Object containing all the utility data.
 */
function getLastSchemaAndPathsRecursive(currentSchema, path, currentPathIndex, currentFullPath, subPaths) {
	var currentPath = path[currentPathIndex];

	if (currentPathIndex != path.length) {
		while ((currentSchema.path(currentPath) === undefined) || (currentSchema.path(currentPath).instance !== "Array")) {
			currentPathIndex++;

			if (currentPathIndex == path.length)
				break;
			else {
				currentPath += '.' + path[currentPathIndex];
			}
		}
	}

	if ((currentSchema.path(currentPath) !== undefined) && (currentSchema.path(currentPath).instance === "Array") && (currentPathIndex < path.length - 1)) {
		subPaths.push(currentPath);
		return getLastSchemaAndPathsRecursive(currentSchema.path(currentPath).schema, path, currentPathIndex + 1, currentPath + ".$[]", subPaths);
	} else {
		var exists;
		if (objectPath.get(currentSchema.tree, currentPath) === undefined)
			exists = false;
		else
			exists = true;

		subPaths.push(currentPath);
		return {
			exists: exists, 
			schema: currentSchema,
			path: currentPath, 
			fullPath: ((currentFullPath !== "") ? (currentFullPath + "." + currentPath) : currentPath), 
			pathToLast: currentFullPath.replace(".$[]", ""), 
			subPaths : subPaths
		};
	}
}

// Exports
module.exports.addSchemaField = addSchemaField;
module.exports.removeSchemaField = removeSchemaField;
module.exports.moveSchemaField = moveSchemaField;
module.exports.changeFieldType = changeFieldType;
module.exports.changeFieldDefinition = changeFieldDefinition;
module.exports.getLastSchemaAndPaths = getLastSchemaAndPaths;