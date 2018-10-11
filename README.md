# Mongoose Dynamic Schemas

A lightweight module which allows to dynamically add, remove, move and redefine schema fields of [Mongoose](http://mongoosejs.com/) models. Useful when you need a model to be flexible but still want it to conform to a well defined schema.

[Test this module online (requires a MongoDB 3.6+ instance)](https://runkit.com/nestorsimagination/5adbcb05fbdb760012439c5b)

[![npm](https://img.shields.io/badge/npn-v1.2.6-brightgreen.svg)](https://www.npmjs.com/package/mongoose-dynamic-schemas)

## Last improvements

The module has been improved to be more robust. Now mongoose 'lean' queries are supported, as defaults are immediately applied to existing documents whenever the changes made to the schema require it.

## Requeriments

The MongoDB database version must be 3.6+ in order for this package to work correctly.

## Documentation

### Importing the module

First download the module:

```
npm install mongoose-dynamic-schemas
```

To import the package:

```
var mongooseDynamic = require ('mongoose-dynamic-schemas');
```

The main functions provided return [ES6 promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), so you can access the results of the operations with '.then' and '.catch'. The schema will be updated in '<model>.schema.tree'. The module functions are listed below:

### Adding a field

To add a new field:

```javascript
addSchemaField(model, path, fieldDefinition)
```

Arguments:
* **model**: The Mongoose model.
* **path (string)**: The path where the field will be added (sucessive fields separated with points, even when a nested field is inside an array). The path can't point to an existing field.
* **fieldDefinition (object)**: The definition of the field to add, including options and other nested fields or arrays.

### Removing a field

To remove a field:

```javascript
removeSchemaField(model, path, removeSubdocumentIfEmpty = false)
```

Arguments:

* **model**: The Mongoose model.
* **path (string)**: The path of the field to remove (sucessive fields separated with points, even when a nested field is inside an array). The path must point to an existing field.
* **removeSubdocumentIfEmpty (boolean)**: Whether to remove the subdocument containing the field to remove if it gets empty (when applicable). For example, if you have the next structure:

```javascript
{
  a : {
    b : String
  }
}
```

And you remove 'a.b', if **removeSubdocumentIfEmpty** is false the next structure would remain:

```javascript
{
  a : {}
}
```

If **removeSubdocumentIfEmpty** is true, the field 'a' would be also removed.
 
### Moving or renaming a field

To move or rename a field:

```javascript
moveSchemaField(model, origin, dest, removeSubdocumentIfEmpty = false)
```

The origin path must point to an existing field. The destination path must point to a non existing field in the same array level of the field at the origin path. The new field will keep the values the original field had, even at sub-array levels.

Arguments:

* **model**: The Mongoose model.
* **origin (string)**: The path of the field to move (sucessive fields separated with points, even when a nested field is inside an array). It must point to an existing field.
* **dest (string)**: The destination path of the field to move (sucessive fields separated with points, even when a nested field is inside an array). It cannot point to an existing field.
* **removeSubdocumentIfEmpty (boolean)**: Same function as the field with the same name of the removeSchemaField method.

### Changing a field's definition
 
To change a field's definition:
 
```javascript
changeFieldDefinition(model, path, newDefinition, )
```
 
Arguments:

* **model**: The Mongoose model.
* **path (string)**: The path to the field whose definition will be changed (sucessive fields separated with points, even when a nested field is inside an array). The path must point to an existing field.
* **newDefinition (object)**: The new definition of the field (same structure as standard Mongoose schema field definitions).

### Changing a field's type

An alternative function to **changeFieldDefinition**:

```javascript
changeFieldType(model, path, newType, defaultValue, required = false, keepValues = false)
```

Arguments:

* **model**: The Mongoose model.
* **path (string)**: The path to the field whose type will be changed (sucessive fields separated with points, even when a nested field is inside an array). The path must point to an existing field.
* **newType (Type)**: The new type of the field (String, Number...).
* **defaultValue**: The default value of the field. If undefined, no default value will be defined for the field.
* **required**: If the field is required or not.
* **keepValues**: Whether to keep the previous values of the field or not. Only mark it as true if changing between compatible types and values (eg. string and integer as long as all the values of that field in the existing documents represent numbers).

## Example

Here is an example where we dynamically change a model's schema at runtime. We define this Dog model:

```javascript
var dogSchema = mongoose.Schema({
	name: {type : String, required : true, default : "No name"},
	color : {type : String, required : true, default : "No color"},
	breed : {type : String, required : true, default : "No breed"},
	age : {type : String, required : true, default : "5"},
	children : {type : Number, required : true, default : 2},
});

var Dog = mongoose.model('Dogs', dogSchema);
```

We add the first dog and print the collection to the console:

```javascript
new Dog({ name: 'Rufo', age : "13", familyDogs : [{name : "Pancho", relation : "Son", friendship : 1 }]}).save()
.then(dogs => console.log("1 - "+util.inspect(dogs, false, null)))
```

The fields that weren't defined in the schema won't be saved:

Output:
```
1 - { name: 'Rufo',
  color: 'No color',
  breed: 'No breed',
  age: '13',
  children: 2,
  _id: 5ad667e31a8aa71c8ca64af0,
  __v: 0 }
  ```

### Adding fields

We add some example fields (the next chunk of code is a continuation of the previous one):

```javascript
.then(result => mongooseDynamic.addSchemaField (Dog, "family", {type : String, default : "No family"}))
.then(result => mongooseDynamic.addSchemaField (Dog, "stats.power", {type : Number, required : true, default : 50}))
.then(result => mongooseDynamic.addSchemaField (Dog, "stats.speed", {type : Number, required : true, default : 55}))
.then(result => mongooseDynamic.addSchemaField (Dog, "familyDogs", [{name : {type : String, default : "No name"}, relation : {type : String, default : "No relation"}, friendship : {type : Number, default : 0}}]))
.then(result => mongooseDynamic.addSchemaField (Dog, "familyDogs.meetings", [{mDate : {type : Date, default : Date.now}}]))
.then(result => mongooseDynamic.addSchemaField (Dog, "familyDogs.meetings.time", {type : Number, default : 10}))
.then(result => mongooseDynamic.addSchemaField (Dog, "familyDogs.meetings.location", {type : String, default : "Somewhere"}))
```

We add another dog and print the collection:

```javascript
.then(result => new Dog({ name: 'Pancho', family : 'Gazquez', familyDogs : [{name : "Rufo", relation : "Father", friendship : 1, meetings : [{time : 15}, {mDate: new Date(2017, 9, 5, 13, 24)}] }, {name : "Bimbo", relation : "Brother" }] }).save())
.then(result => Dog.find({}).exec())
.then(dogs => console.log("2 - "+util.inspect(dogs, false, null)))
```

Results:

```
2 - [ { stats: { power: 50, speed: 55 },
    name: 'Rufo',
    color: 'No color',
    breed: 'No breed',
    age: '13',
    children: 2,
    family: 'No family',
    familyDogs: [],
    _id: 5ad667e31a8aa71c8ca64af0,
    __v: 0 },
  { stats: { power: 50, speed: 55 },
    name: 'Pancho',
    color: 'No color',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    familyDogs:
     [ { name: 'Rufo',
         relation: 'Father',
         friendship: 1,
         meetings:
          [ { time: 15,
              location: 'Somewhere',
              mDate: 2018-04-17T21:32:19.957Z,
              _id: 5ad667e31a8aa71c8ca64af5 },
            { time: 10,
              location: 'Somewhere',
              mDate: 2017-10-05T11:24:00.000Z,
              _id: 5ad667e31a8aa71c8ca64af4 } ],
         _id: 5ad667e31a8aa71c8ca64af3 },
       { name: 'Bimbo',
         relation: 'Brother',
         friendship: 0,
         meetings: [],
         _id: 5ad667e31a8aa71c8ca64af2 } ],
    _id: 5ad667e31a8aa71c8ca64af1,
    __v: 0 } ]
```

### Removing fields

Time to remove some fields:

```javascript
.then(result => mongooseDynamic.removeSchemaField (Dog, "stats.speed"))
.then(result => mongooseDynamic.removeSchemaField (Dog, "familyDogs.name"))
```

We add another dog and print the collection:

```javascript
.then(result => new Dog({ name: 'Bimbo', family : 'Gazquez', color : 'Black', stats : {power : 20 }}).save())
.then(result => Dog.find({}).exec())
.then(dogs => console.log("3 - "+util.inspect(dogs, false, null)))
```

Results:

```
3 - [ { stats: { power: 50 },
    name: 'Rufo',
    color: 'No color',
    breed: 'No breed',
    age: '13',
    children: 2,
    family: 'No family',
    familyDogs: [],
    _id: 5ad667e31a8aa71c8ca64af0,
    __v: 0 },
  { stats: { power: 50 },
    name: 'Pancho',
    color: 'No color',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    familyDogs:
     [ { relation: 'Father',
         friendship: 1,
         meetings:
          [ { time: 15,
              location: 'Somewhere',
              mDate: 2018-04-17T21:32:19.957Z,
              _id: 5ad667e31a8aa71c8ca64af5 },
            { time: 10,
              location: 'Somewhere',
              mDate: 2017-10-05T11:24:00.000Z,
              _id: 5ad667e31a8aa71c8ca64af4 } ],
         _id: 5ad667e31a8aa71c8ca64af3 },
       { relation: 'Brother',
         friendship: 0,
         meetings: [],
         _id: 5ad667e31a8aa71c8ca64af2 } ],
    _id: 5ad667e31a8aa71c8ca64af1,
    __v: 0 },
  { stats: { power: 20 },
    name: 'Bimbo',
    color: 'Black',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    familyDogs: [],
    _id: 5ad667e41a8aa71c8ca64af6,
    __v: 0 } ]
```

### Moving fields

Now we move some fields. Remember that you cannot move a field between different array levels. For example, if we have the next structure:

```javascript
{a : 
  [{
    b : <...>,
    c : <...>
  }],
  d : <...>
}
```

You would be allowed to do theese:

```javascript
mongooseDynamic.moveSchemaField (model, "a.b", "a.e")
mongooseDynamic.moveSchemaField (model, "a.b", "a.e.f")
```

But not these:

```javascript
mongooseDynamic.moveSchemaField (model, "a.b", "b")
mongooseDynamic.moveSchemaField (model, "d", "a.d")
```

Anyway, so we move some fields:

```javascript
.then(result => mongooseDynamic.moveSchemaField (Dog, "color", "looks.colour"))
.then(result => mongooseDynamic.moveSchemaField (Dog, "stats.power", "power"))
.then(result => mongooseDynamic.moveSchemaField (Dog, "familyDogs.friendship", "familyDogs.something.love"))
```

We add yet another dog and print the collection:

```javascript
.then(result => new Dog({ name: 'Lola', family : 'Gazquez' }).save())
.then(result => Dog.find({}).exec())
.then(dogs => console.log("4 - "+util.inspect(dogs, false, null)))
```

Results:

```
4 - [ { looks: { colour: 'No color' },
    name: 'Rufo',
    breed: 'No breed',
    age: '13',
    children: 2,
    family: 'No family',
    power: 50,
    familyDogs: [],
    _id: 5ad667e31a8aa71c8ca64af0,
    __v: 2 },
  { looks: { colour: 'No color' },
    name: 'Pancho',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    power: 50,
    familyDogs:
     [ { something: { love: 1 },
         relation: 'Father',
         meetings:
          [ { time: 15,
              location: 'Somewhere',
              mDate: 2018-04-17T21:32:19.957Z,
              _id: 5ad667e31a8aa71c8ca64af5 },
            { time: 10,
              location: 'Somewhere',
              mDate: 2017-10-05T11:24:00.000Z,
              _id: 5ad667e31a8aa71c8ca64af4 } ],
         _id: 5ad667e31a8aa71c8ca64af3 },
       { something: { love: 0 },
         relation: 'Brother',
         meetings: [],
         _id: 5ad667e31a8aa71c8ca64af2 } ],
    _id: 5ad667e31a8aa71c8ca64af1,
    __v: 1 },
  { looks: { colour: 'Black' },
    name: 'Bimbo',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    power: 20,
    familyDogs: [],
    _id: 5ad667e41a8aa71c8ca64af6,
    __v: 1 },
  { looks: { colour: 'No color' },
    name: 'Lola',
    breed: 'No breed',
    age: '5',
    children: 2,
    family: 'Gazquez',
    power: 50,
    familyDogs: [],
    _id: 5ad667e51a8aa71c8ca64af7,
    __v: 0 } ]
```

Note that, for the dog "Pancho", the values from the moved field "familyDogs.something.love" (previously "familyDogs.friendship") have been kept.

### Changing field definitions

Finally, we redefine some fields:

```javascript
.then(result => mongooseDynamic.changeFieldType (Dog, "age", Number))
.then(result => mongooseDynamic.changeFieldDefinition (Dog, "breed", {field1 : {type : String, default : "Pomerania", required: true}, field2 : {type : Number, default : 6, required: true}}))
.then(result => mongooseDynamic.changeFieldDefinition (Dog, "children", {type : Boolean, default : false, required: true}))
.then(result => mongooseDynamic.changeFieldDefinition (Dog, "looks.colour", {type : Number, default : 3, required: true}))
.then(result => mongooseDynamic.changeFieldDefinition (Dog, "familyDogs.meetings.location", {type : Number, default : 2, required: true}))
.then(result => mongooseDynamic.changeFieldDefinition (Dog, "familyDogs.relation", {type : Boolean, default : true, required: true}))
```

We add another dog, make some update query to show that it is really working and print the collection:

```javascript
.then(result => new Dog({ name: 'Wolf', family : 'Some family' , familyDogs : [{name : "Pepe", friendship : 4, hello : "nope"}]}).save())
.then(result => Dog.update({name : "Pancho"}, {"familyDogs.$[].meetings.$[].location" : 4}).exec())
.then(result => Dog.find({}).exec())
.then(dogs => console.log("5 - "+util.inspect(dogs, false, null)))
```

Results:

```
5 - [ { breed: { field1: 'Pomerania', field2: 6 },
    looks: { colour: 3 },
    name: 'Rufo',
    family: 'No family',
    power: 50,
    children: false,
    familyDogs: [],
    _id: 5ad680d204545d32c8ff387e,
    age: 13,
    __v: 2 },
  { breed: { field1: 'Pomerania', field2: 6 },
    looks: { colour: 3 },
    name: 'Pancho',
    family: 'Gazquez',
    power: 50,
    children: false,
    familyDogs:
     [ { something: { love: 1 },
         relation: true,
         meetings:
          [ { time: 15,
              location: 4,
              mDate: 2018-04-17T23:18:42.569Z,
              _id: 5ad680d204545d32c8ff3883 },
            { time: 10,
              location: 4,
              mDate: 2017-10-05T11:24:00.000Z,
              _id: 5ad680d204545d32c8ff3882 } ],
         _id: 5ad680d204545d32c8ff3881 },
       { something: { love: 0 },
         relation: true,
         meetings: [],
         _id: 5ad680d204545d32c8ff3880 } ],
    _id: 5ad680d204545d32c8ff387f,
    age: 5,
    __v: 1 },
  { breed: { field1: 'Pomerania', field2: 6 },
    looks: { colour: 3 },
    name: 'Bimbo',
    family: 'Gazquez',
    power: 20,
    children: false,
    familyDogs: [],
    _id: 5ad680d204545d32c8ff3884,
    age: 5,
    __v: 1 },
  { breed: { field1: 'Pomerania', field2: 6 },
    looks: { colour: 3 },
    name: 'Lola',
    family: 'Gazquez',
    power: 50,
    children: false,
    familyDogs: [],
    _id: 5ad680d304545d32c8ff3885,
    age: 5,
    __v: 0 },
  { breed: { field1: 'Pomerania', field2: 6 },
    looks: { colour: 3 },
    name: 'Wolf',
    family: 'Some family',
    power: 50,
    children: false,
    familyDogs:
     [ { something: { love: 0 },
         relation: true,
         meetings: [],
         _id: 5ad680d304545d32c8ff3887 } ],
    _id: 5ad680d304545d32c8ff3886,
    __v: 0 } ]
```

As you can see, the update on the 'familyDogs.meetings.location' for the dog "Pancho" has been successful.

### Getting the current schemas

Now that we have been modifying the model's schema over and over we may want to check that the changes have been saved. We print the model's schema:

```javascript
.then(dogs => console.log(util.inspect(Dog.schema.tree, false, null)))
```

The result is:

```
{ 
  name: { 
    type: [Function: String], 
    required: true, 
    default: 'No name' 
  },
  _id: { 
    auto: true,
    type: { 
      [Function: ObjectId] schemaName: 'ObjectId' 
    } 
  },
  __v: [Function: Number],
  id: VirtualType {
    path: 'id',
    getters: [ [Function: idGetter] ],
    setters: [],
    options: {} 
  },
  family: { 
    type: [Function: String], 
    default: 'No family' 
  },
  stats: {},
  familyDogs: [{ 
    meetings: [{
      mDate: { 
        type: [Function: Date], 
        default: [Function: now] 
      },
      time: { 
        type: [Function: Number], 
        default: 10 
      },
      location: { 
        type: [Function: Number], 
        default: 2, 
        required: true 
      } 
    }],
    something: { 
      love: { 
        type: [Function: Number],
        default: 0 
      } 
    },
    relation: { 
      type: [Function: Boolean], 
      default: true, 
      required: true 
    } 
  }],
  looks: { 
    colour: { 
      type: [Function: Number], 
      default: 3, 
      required: true 
    } 
  },
  power: { 
    type: [Function: Number], 
    required: true, default: 50 
  },
  age: { type: [Function: Number] },
  breed: { 
    field1: { type: [Function: String],
      default: 'Pomerania',
      required: true 
    },
    field2: { 
      type: [Function: Number], 
      default: 6, required: true 
    } 
  },
  children: { 
    type: [Function: Boolean], 
    default: false, 
    required: true 
  } 
}
```

We also print the schema for the 'familyDogs' array:

```javascript
.then(function() {console.log(util.inspect(Dog.schema.path("familyDogs").schema.tree, false, null))})
```

The result is:

```
{
  _id: {
    auto: true,
    type: { [Function: ObjectId] schemaName: 'ObjectId' } },
  id:
    VirtualType {
      path: 'id',
      getters: [ [Function: idGetter] ],
      setters: [],
      options: {} 
  },
  meetings: [{ 
    mDate: { 
      type: [Function: Date], 
      default: [Function: now] },
      time: { 
        type: [Function: Number], 
        default: 10
      },
      location: { 
        type: [Function: Number], 
        default: 2, 
        required: true 
      } 
    } 
  ],
  something: { 
    love: { 
      type: [Function: Number], 
      default: 0 
    } 
  },
  relation: { 
    type: [Function: Boolean], 
    default: true, 
    required: true 
  } 
}
```
