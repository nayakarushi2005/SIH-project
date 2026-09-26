const mongoose = require('mongoose');

/**
 * One edge of the knowledge graph: (from) -[rel {weight}]-> (to).
 *
 *   worker -HAS_SKILL-> skill          weight 0..1: proven level in that trade
 *   worker -HAS_TRAIT-> trait          weight 0..1: how strongly clients praise it
 *   worker -NEEDS_IMPROVEMENT-> trait  weight 0..1: repeated criticism
 *   worker -NEEDS_IMPROVEMENT-> skill  weight 0..1: repeatedly low-rated in a trade
 *   client -VALUES-> trait             weight 0..1: how much this client cares
 *
 * Client↔worker history lives in Affinity, which ranking reads directly.
 * Node ids are strings: User ids for workers/clients, service ids for
 * skills, trait ids for traits (and, later, course ids for courses).
 *
 * Edges are derived data: services/graph.js rebuilds a node's edges from
 * all of its feedback, so they can always be regenerated.
 */
const graphEdgeSchema = new mongoose.Schema(
  {
    fromType: { type: String, enum: ['worker', 'client'], required: true },
    fromId: { type: String, required: true },
    rel: {
      type: String,
      enum: ['HAS_SKILL', 'HAS_TRAIT', 'NEEDS_IMPROVEMENT', 'VALUES'],
      required: true,
    },
    toType: { type: String, enum: ['skill', 'trait'], required: true },
    toId: { type: String, required: true },

    weight: { type: Number, required: true },
    evidence: { type: Number, default: 0 }, // how many feedback/jobs back this edge
    props: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

graphEdgeSchema.index({ fromType: 1, fromId: 1, rel: 1, toType: 1, toId: 1 }, { unique: true });
// "Which workers need to improve X?" — for course recommendations later.
graphEdgeSchema.index({ rel: 1, toType: 1, toId: 1, weight: -1 });

module.exports = mongoose.model('GraphEdge', graphEdgeSchema);
