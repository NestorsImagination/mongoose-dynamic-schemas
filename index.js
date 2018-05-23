'use strict';

const objectPath = require("object-path");

/**
 * Adds the given field to the Mongoose model at the end of the path.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} path The path where the field will be added (sucessive fields separated with points, even when a 
 * nested field is inside an array). The path can't point to an existing field.
 * @param {object} fieldDefinition The definition of the field to add, including options and other nested fields,
 * subdocuments or arrays.
 * @returns {Promise.<string, string>} Results of the operation.
 */
function addSchemaField(model, path, fieldDefinition) {
	return new Promise(function (resolve, reject) {
		if (!pathIsValid(path)) {
			reject("The path is not valid");
		} else {
			var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

			if (lastSchemaAndPaths.exists) {
				reject("The field to add already exists (" + path + ")");
			} else {
				// If the field is going to be added inside a field previously containing an empty subdocument ({}),
				// this field must be removed before adding the new field in order to avoid errors

				var lastPaths = lastSchemaAndPaths.path.split('.');
				if (lastPaths.length > 1) {
					var fieldName = lastPaths.pop();
					var previousField = objectPath.get(lastSchemaAndPaths.schema.tree, lastPaths.join('.'));

					if (previousField != undefined && ((Object.keys(previousField).length === 0) ||
						(previousField.type && (Object.keys(previousField.type).length === 0)))) {

						removeSchemaField(model, lastSchemaAndPaths.pathToLast + lastPaths)
							.then(() => addSchemaAux(model, lastSchemaAndPaths, fieldDefinition))
							.then(() => resolve("Field added successfully"))
							.catch(error => reject(error));
					} else {
						addSchemaAux(model, lastSchemaAndPaths, fieldDefinition)
							.then(() => resolve("Field added successfully"))
							.catch(error => reject(error));
					}
				} else {
					addSchemaAux(model, lastSchemaAndPaths, fieldDefinition)
						.then(() => resolve("Field added successfully"))
						.catch(error => reject(error));
				}
			}
		}
	});
}

/**
 * Auxiliary method for addSchemaField.
 * 
 * @param {object} model The Mongoose model.
 * @param {object} lastSchemaAndPaths The variable with the same name from the main method
 * @param {*} fieldDefinition The definition of the new field.
 */
function addSchemaAux(model, lastSchemaAndPaths, fieldDefinition) {
	return new Promise(function (resolve, reject) {
		var addQuery = {};
		objectPath.set(addQuery, lastSchemaAndPaths.path, fieldDefinition);

		lastSchemaAndPaths.schema.add(addQuery);

		// Updates all the array schema trees
		for (var currentSchema = model.schema; lastSchemaAndPaths.subPaths.length > 1;
			currentSchema = currentSchema.path(lastSchemaAndPaths.subPaths[0]).schema,
			lastSchemaAndPaths.subPaths.shift()) {

			objectPath.set(currentSchema.tree, lastSchemaAndPaths.subPaths.join('.0.'), fieldDefinition);
		}

		updateDefaults(model, lastSchemaAndPaths.subPaths[0])
			.then(() => resolve())
			.catch(error => reject(error));
	});
}

/**
 * Removes the field of the Mongoose model at the end of the path.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} path The path of the field to remove (sucessive fields separated with points, even when a nested 
 * field is inside an array). The path must point to an existing field.
 * @param {boolean} removeSubdocumentIfEmpty Whether to remove the subdocument containing the field to remove if it gets 
 * empty (when applicable).
 * @returns {Promise.<string, string>} Results of the operation.
 */
function removeSchemaField(model, path, removeSubdocumentIfEmpty = false) {
	return new Promise(function (resolve, reject) {
		if (!pathIsValid(path)) {
			reject("The path is not valid");
		} else {
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
					.then(() => {
						model.schema.remove(lastSchemaAndPaths.fullPath);
						lastSchemaAndPaths.schema.remove(lastSchemaAndPaths.path);

						// Removes the path from the subpaths if it is included (to avoid problems when updating later)
						delete model.schema.subpaths[lastSchemaAndPaths.subPaths.join('.0.')];

						for (var currentSchema = model.schema; lastSchemaAndPaths.subPaths.length > 1;
							currentSchema = currentSchema.path(lastSchemaAndPaths.subPaths[0]).schema,
							lastSchemaAndPaths.subPaths.shift()) {
							objectPath.del(currentSchema.tree, lastSchemaAndPaths.subPaths.join('.0.'));
						}

						if (removeSubdocumentIfEmpty) {
							objectPath.del(lastSchemaAndPaths.schema.tree, lastSchemaAndPaths.path);

							var lastPathArray = lastSchemaAndPaths.path.split('.');

							if (lastPathArray.length > 1) {
								lastPathArray.pop();
								if (Object.keys(objectPath.get(lastSchemaAndPaths.schema.tree,
									lastPathArray.join('.'))).length === 0) {

									removeSchemaField(model, (lastSchemaAndPaths.pathToLast === "") ?
										lastPathArray.join('.') :
										lastSchemaAndPaths.pathToLast + '.' + lastPathArray.join('.'))
										.then(() => resolve("Field removed successfully"));
								} else resolve("Field removed successfully");
							} else resolve("Field removed successfully");
						} else resolve("Field removed successfully");
					})
					.catch(error => reject(error));
			}
		}
	});
}

/**
 * Moves (or renames) the field at the origin path to a new field at the destination path.
 * 
 * The origin path must point to an existing field. The destination path must point to a non existing field in the same
 * array level of the field at the origin path.
 * 
 * The new field will keep the values the original field had, even at sub-array levels.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} origin The path of the field to move (sucessive fields separated with points, even when a nested 
 * field is inside an array). It must point to an existing field.
 * @param {string} dest The destination path of the field to move (sucessive fields separated with points, even 
 * when a nested field is inside an array). It cannot point to an existing field.
 * @param {boolean} removeSubdocumentIfEmpty Whether to remove the subdocument containing the origin field if it gets 
 * empty (when applicable).
 * @returns {Promise.<string, string>} Results of the operation.
 */
function moveSchemaField(model, origin, dest, removeSubdocumentIfEmpty = false) {
	return new Promise(function (resolve, reject) {
		if (!pathIsValid(origin)) {
			reject("The origin path is not valid");
		} else if (!pathIsValid(path)) {
			reject("The destination path is not valid");
		} else {
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
						.then(() => model.find({}).exec())
						.then(docs => {
							var numToUpdate = docs.length;

							if (numToUpdate == 0)
								resolve("Field moved successfully")
							else {
								var numUpdated = 0;

								docs.forEach(function (doc) {
									moveForAllSubArrays(doc, lastSchemaAndPathsOrigin.subPaths, lastSchemaAndPathsDest.path);
									doc.markModified(lastSchemaAndPathsDest.subPaths[0]);

									doc.save(function (error) {
										if (error) reject(error);
										numUpdated++;

										if (numUpdated == numToUpdate) {
											removeSchemaField(model, origin, removeSubdocumentIfEmpty)
												.then(() => resolve("Field moved successfully"))
												.catch(error => reject(error));
										}
									});
								});
							}
						})
						.catch(error => reject(error));
				}
			}
		}
	});
}

/**
 * Changes the definition of the field at the given path.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} path The path to the field whose definition will be changed (sucessive fields separated with points, 
 * even when a nested field is inside an array). The path must point to an existing field.
 * @param {object} newDefinition The new definition of the field (same structure as standard Mongoose schema field 
 * definitions).
 * @returns {Promise.<string, string>} Results of the operation.
 */
function changeFieldDefinition(model, path, newDefinition) {
	return new Promise(function (resolve, reject) {
		if (!pathIsValid(path)) {
			reject("The path is not valid");
		} else {
			var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

			if (!lastSchemaAndPaths.exists)
				reject("The path does not point to an existing field (" + path + ")");

			var fieldDefinition = {};

			objectPath.set(fieldDefinition, lastSchemaAndPaths.path, newDefinition);

			removeSchemaField(model, path)
				.then(() => addSchemaField(model, path, newDefinition))
				.then(() => updateDefaults(model, lastSchemaAndPaths.subPaths[0]))
				.then(() => resolve("Field definition modified"))
				.catch(error => reject(error));
		}
	});
}

/**
 * Alternative function to change a field's type, more limited than changeFieldDefinition.
 * 
 * @param {object} model The Mongoose model.
 * @param {string} path The path of the field whose type will be changed (sucessive fields separated with points, even 
 * when a nested field is inside an array).
 * @param {object} newType The new type of the field (String, Number...).
 * @param {string} defaultValue The default value of the field. If undefined, no default value will be defined for the 
 * field.
 * @param {boolean} required If the field is required or not. If undefined, it will be tagged as not required.
 * @param {boolean} keepValues Whether to keep the previous values of the field or not. Only mark it as true if changing
 * between compatible types and values (eg. string and integer as long as all the values of that field in the existing 
 * documents represent numbers).
 * @returns {Promise.<string, string>} Results of the operation.
 */
function changeFieldType(model, path, newType, defaultValue, required = false, keepValues = false) {
	return new Promise(function (resolve, reject) {
		if (!pathIsValid(path)) {
			reject("The path is not valid");
		} else {
			var lastSchemaAndPaths = getLastSchemaAndPaths(model.schema, path);

			if (!lastSchemaAndPaths.exists)
				reject("The path does not point to an existing field (" + path + ")");

			var fieldDefinition = {};

			objectPath.set(fieldDefinition, lastSchemaAndPaths.path,
				objectPath.get(lastSchemaAndPaths.schema.tree, lastSchemaAndPaths.path));

			var fieldDefinitionSuper = objectPath.get(fieldDefinition, lastSchemaAndPaths.path);
			fieldDefinitionSuper.type = newType;
			if (defaultValue != undefined)
				fieldDefinitionSuper.default = defaultValue;
			else
				delete fieldDefinitionSuper.default;

			if (required)
				fieldDefinitionSuper.required = required;
			else
				delete fieldDefinitionSuper.required;

			lastSchemaAndPaths.schema.remove(lastSchemaAndPaths.path);
			lastSchemaAndPaths.schema.add(fieldDefinition);

			if (!keepValues) {
				var update = {};
				update[lastSchemaAndPaths.fullPath] = defaultValue;

				var updateQuery = {};
				if (lastSchemaAndPaths.pathToLast != "")
					updateQuery[lastSchemaAndPaths.pathToLast] = { $gt: [] };

				model.update(updateQuery, { $set: update }, { multi: true, upsert: false })
					.then(() => resolve("Field type changed"))
					.catch(error => reject(error));
			} else {
				updateDefaults(model, lastSchemaAndPaths.subPaths[0])
					.then(() => resolve("Field type changed"))
					.catch(error => reject(error));
			}

			resolve("Field type changed");
		}
	});
}

// Utilities

/**
 * Checks whether a given path is valid for referencing a MongoDB field. It is not valid if:
 * 
 * - The path starts with a '.' character
 * - The path contains multiple subsequent '.' characters
 * - The path contains the special '$' character
 * 
 * @param {string} path The path to check
 * @returns {boolean} Whether the path is valid
 */
function pathIsValid(path) {
	return !((path.charAt(0) === '.') || (path.charAt(path.length - 1) === '.') || path.includes('..') || path.includes('$'))
}

/**
 * Moves the value of the fields at the end of the subPaths array to the field at lastDestPath in the same array 
 * level, doing this for all instances of that field in the case it is contained inside one or multiple arrays.
 * 
 * @param {object} doc The document.
 * @param {string[]} subPaths Subpaths that point to the field whose value will be moved.
 * @param {string} lastDestPath Path inside the same array level of the other field where the value will be moved.
 */
function moveForAllSubArrays(doc, subPaths, lastDestPath) {
	moveForAllSubArraysRecursive(doc, subPaths, lastDestPath, 0);
}

/**
 * Auxiliary function for moveForAllSubArrays.
 * 
 * @param {object} doc The document.
 * @param {string[]} subPaths Subpaths that point to the field whose value will be moved.
 * @param {string} lastDestPath Path inside the same array level of the other field where the value will be moved.
 * @param {number} currentPathIndex The current index of the array levels to explore.
 */
function moveForAllSubArraysRecursive(doc, subPaths, lastDestPath, currentPathIndex) {
	if (currentPathIndex == (subPaths.length - 1)) {
		objectPath.set(doc._doc, lastDestPath, objectPath.get(doc._doc, subPaths[currentPathIndex]))
	} else {
		objectPath.get(doc._doc, subPaths[currentPathIndex]).forEach(function (subDoc) {
			moveForAllSubArraysRecursive(subDoc, subPaths, lastDestPath, currentPathIndex + 1);
		});
	}
}

/**
 * Returns an object containing useful information given an schema and a path. The fields contained are:
 * 
 * - exists: If the path points to an existing field.
 * - schema: The schema of the sub-array the path is pointing to.
 * - path: The path to the pointed location inside its own array level.
 * - fullPath: The fill path to the field pointed by the given path.
 *   A ".$[]" symbol is added in each array position so it to be used in queries (requires MongoDB 3.6+).
 * - pathToLast: Path that points to the last array where the field pointed by the given path is located.
 * - subPaths: Array of paths, where each subpath points to the next array or, for the last subpath, to the location the
 * given path points to inside its own array.
 * 
 * @param {object} schema The schema to explore.
 * @param {string} path The path to the field.
 * @returns {object} Object containing all the utility data.
 */
function getLastSchemaAndPaths(schema, path) {
	return getLastSchemaAndPathsRecursive(schema, path.split('.'), 0, "", []);
}

/**
 * Auxiliary function for getLastSchemaAndPaths.
 * 
 * @param {object} currentSchema The schema currently being explored.
 * @param {string} path The path to the field.
 * @param {number} currentPathIndex The current index of the subpaths to explore.
 * @param {string} currentFullPath The current full path.
 * @param {array} subPaths The array of subpaths. 
 * @returns {object} Object containing all the utility data.
 */
function getLastSchemaAndPathsRecursive(currentSchema, path, currentPathIndex, currentFullPath, subPaths) {
	var currentPath = path[currentPathIndex];

	if (currentPathIndex != path.length) {
		while ((currentSchema.path(currentPath) === undefined) ||
			(currentSchema.path(currentPath).instance !== "Array")) {

			currentPathIndex++;

			if (currentPathIndex == path.length)
				break;
			else {
				currentPath += '.' + path[currentPathIndex];
			}
		}
	}

	if ((currentSchema.path(currentPath) !== undefined) &&
		(currentSchema.path(currentPath).instance === "Array") &&
		(currentPathIndex < path.length - 1)) {

		subPaths.push(currentPath);
		return getLastSchemaAndPathsRecursive(currentSchema.path(currentPath).schema, path,
			currentPathIndex + 1, ((currentFullPath === "") ? currentPath :
				currentFullPath + ".$[]." + currentPath), subPaths);
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
			fullPath: ((currentFullPath === "") ? currentPath : (currentFullPath + ".$[]." + currentPath)),
			pathToLast: currentFullPath.replace(".$[]", ""),
			subPaths: subPaths
		};
	}
}

/**
 * Updates the defaults values of the previously existing documents when necessary
 * 
 * @param {*} model The model.
 * @param {*} path The path where the defaults will be updated.
 */
function updateDefaults(model, path) {
	return new Promise(function (resolve, reject) {
		model.find({}, function (error, docs) {
			if (error) reject(error);
			else {
				var numToSave = docs.length;

				if (numToSave == 0)
					resolve();
				else {
					var numSaved = 0;
					docs.forEach(function (doc) {
						doc.markModified(path);

						doc.save(function (error) {
							if (error) reject(error);
							else {
								numSaved++;

								if (numSaved == numToSave)
									resolve();
							}
						});
					});
				}
			}
		});
	});
}

// Exports
module.exports.addSchemaField = addSchemaField;
module.exports.removeSchemaField = removeSchemaField;
module.exports.moveSchemaField = moveSchemaField;
module.exports.changeFieldType = changeFieldType;
module.exports.changeFieldDefinition = changeFieldDefinition;
module.exports.getLastSchemaAndPaths = getLastSchemaAndPaths;