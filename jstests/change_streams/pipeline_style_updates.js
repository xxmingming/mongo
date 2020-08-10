/**
 * Test the change events generated by pipeline-based updates are expected with delta format oplog
 * enabled and disabled.
 *
 * @tags: [requires_fcv_47]
 */

(function() {
"use strict";

load("jstests/libs/change_stream_util.js");        // For ChangeStreamTest
load("jstests/libs/collection_drop_recreate.js");  // For assert[Drop|Create]Collection.
load("jstests/libs/discover_topology.js");         // For findNonConfigNodes.
load("jstests/noPassthrough/libs/server_parameter_helpers.js");  // For setParameterOnAllHosts.

jsTestLog("Testing when $v:2 oplog entry is enabled.");
setParameterOnAllHosts(DiscoverTopology.findNonConfigNodes(db.getMongo()),
                       "internalQueryEnableLoggingV2OplogEntries",
                       true);

assertDropAndRecreateCollection(db, "t1");

const kLargeStr = '*'.repeat(512);

assert.commandWorked(db.t1.insert({
    _id: 100,
    "a": 1,
    "b": 2,
    "obj": {"a": 1, "b": 2, "str": kLargeStr},
}));

const cst = new ChangeStreamTest(db);
const changeStreamCursor =
    cst.startWatchingChanges({pipeline: [{$changeStream: {}}], collection: db.t1});

function testPipelineStyleUpdate(pipeline, expectedChange, operationType) {
    assert.commandWorked(db.t1.update({_id: 100}, pipeline));
    const expected = Object.assign({
        documentKey: {_id: 100},
        ns: {db: "test", coll: "t1"},
        operationType: operationType,
    },
                                   expectedChange);
    cst.assertNextChangesEqual({cursor: changeStreamCursor, expectedChanges: [expected]});
}

jsTestLog("Testing pipeline-based update with $set.");
let updatePipeline = [{$set: {a: 2}}];
let expected = {
    updateDescription: {
        updatedFields: {"a": 2},
        removedFields: [],
        truncatedArrays: [],
    },
};
testPipelineStyleUpdate(updatePipeline, expected, "update");

jsTestLog("Testing pipeline-based update with $unset.");
updatePipeline = [{$unset: ["a"]}];
expected = {
    updateDescription: {
        updatedFields: {},
        removedFields: ["a"],
        truncatedArrays: [],
    },
};
testPipelineStyleUpdate(updatePipeline, expected, "update");

jsTestLog("Testing pipeline-based update with $replaceRoot.");
updatePipeline =
    [{$replaceRoot: {newRoot: {_id: 100, b: 2, "obj": {"a": 2, "b": 2, "str": kLargeStr}}}}];
expected = {
    updateDescription: {
        updatedFields: {"obj.a": 2},
        removedFields: [],
        truncatedArrays: [],
    },
};
testPipelineStyleUpdate(updatePipeline, expected, "update");

jsTestLog("Testing when $v:2 oplog entry is disabled.");
setParameterOnAllHosts(DiscoverTopology.findNonConfigNodes(db.getMongo()),
                       "internalQueryEnableLoggingV2OplogEntries",
                       false);

jsTestLog("Testing pipeline-based update with $set.");
updatePipeline = [{$set: {a: 2}}];
expected = {
    fullDocument: {
        _id: 100,
        "a": 2,
        "b": 2,
        "obj": {"a": 2, "b": 2, "str": kLargeStr},
    },
};
testPipelineStyleUpdate(updatePipeline, expected, "replace");

jsTestLog("Testing pipeline-based update with $unset.");
updatePipeline = [{$unset: ["a"]}];
delete expected.fullDocument.a;
testPipelineStyleUpdate(updatePipeline, expected, "replace");

jsTestLog("Testing pipeline-based update with $replaceRoot.");
updatePipeline = [{$replaceRoot: {newRoot: {_id: 100, "a": 1, "b": 2}}}];
expected = {
    fullDocument: {
        _id: 100,
        "a": 1,
        "b": 2,
    },
};
testPipelineStyleUpdate(updatePipeline, expected, "replace");

cst.cleanUp();
}());
