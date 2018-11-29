

module.exports = (function() {

    // TODO: an inferior implementation of Map
    // const Map = require('core2/analysis/map');

    /**
     * Construct a graph node.
     * @param {*} key 
     * @constructor
     * @inner
     */
    function Node(key) {
        this.key = key;
        this.inbound = [];
        this.outbound = [];
    }

    Node.prototype.toString = function() {
        return this.key.toString(16);
    };

    /**
     * Construct a directed graph object.
     * @param {Array.<*>} nodes List of node keys to add
     * @param {Array.<Array.<*>>} edges List of node key pairs, where pointing node key is first and pointed is second
     * @param {*} root Key of root node; must be one of `nodes`
     * @constructor
     */
    function Directed(nodes, edges, root) {
        this.nodes = {};
        this.root = undefined;

        if (nodes) {
            nodes.forEach(this.addNode, this);
        }

        if (edges) {
            edges.forEach(this.addEdge, this);
        }

        if (root) {
            this.setRoot(root);
        }
    }

    Directed.prototype.toString = function() {
        return Object.keys(this.nodes).map(function(k) {
            var n = this.nodes[k];

            var outs = this.successors(n).map(function(succ) {
                return succ.toString();
            });

            return [n.toString(), '->', '[' + outs.join(', ') + ']'].join(' ');
        }, this).join('\n');
    };

    /**
     * Add a node to the graph.
     * @param {*} key A key the node can be retrieved with; keys must be unique
     */
    Directed.prototype.addNode = function(key) {
        this.nodes[key] = new Node(key);
    };

    /**
     * Retrieve a node by its key.
     * @param {*} key A key the node can be retrieved with
     * @return {Node} Node whose key equals to `key`, or `undefined` if key not found
     */
    Directed.prototype.getNode = function(key) {
        return this.nodes[key];
    };

    /**
     * Set graph root node.
     * @param {*} key A key the node to be root can be retrieved with; `key` must exist already in graph
     */
    Directed.prototype.setRoot = function(key) {
        this.root = this.getNode(key);
    };

    Directed.prototype.addEdge = function(edge) {
        var src = this.getNode(edge[0]);
        var dst = this.getNode(edge[1]);

        src.outbound.push(dst);
        dst.inbound.push(src);
    };

    // not really an iterator, as Duktape does not support "yield" and "function*"
    // returns a list of nodes in insertion order
    Directed.prototype.iterNodes = function() {
        // Duktape does not support Object.values() neither...
        return Object.keys(this.nodes).map(function(k) { return this.nodes[k]; }, this);
    };

    Directed.prototype.predecessors = function(node) {
        return this.getNode(node.key).inbound;
    };

    Directed.prototype.successors = function(node) {
        return this.getNode(node.key).outbound;
    };

    // --------------------------------------------------

    // construct a depth-first spanning tree of graph g
    function DFSpanningTree(g) {
        var _nodes = [];
        var _edges = [];

        var explore = function(n) {
            _nodes.push(n.key);

            g.successors(n).forEach(function(succ) {
                if (_nodes.indexOf(succ.key) === (-1)) {
                    _edges.push([n.key, succ.key]);

                    explore(succ);
                }
            });
        };

        explore(g.root);

        Directed.call(this, _nodes, _edges, _nodes[0]);

        this.keys_dfs = _nodes;

        // modify nodes to hold only relevant data
        this.iterNodes().forEach(function(n, i) {
            // the order index in the tree
            n.dfnum = i;
        });
    }

    DFSpanningTree.prototype = Object.create(Directed.prototype);
    DFSpanningTree.prototype.constructor = DFSpanningTree;

    DFSpanningTree.prototype.parent = function(node) {
        // for every node in a [spanning] tree has zero or one predecessors
        return this.predecessors(node)[0];
    };

    DFSpanningTree.prototype.iterNodes = function() {
        return this.keys_dfs.map(function(k) { return this.nodes[k]; }, this);
    };

    // --------------------------------------------------

    // using Lengauer-Tarjan algorithm to compute dominance tree
    function DominatorTree(g) {
        this.cfg = g;

        var AncestorWithLowestSemi = function(v) {
            var a = v.ancestor;

            if (a.ancestor) {
                var b = AncestorWithLowestSemi(a);

                v.ancestor = a.ancestor;
                if (b.semi.dfnum < v.best.semi.dfnum) {
                    v.best = b;
                }
            }

            return v.best;
        };

        var Link = function(p, n) {
            n.ancestor = p;
            n.best = n;
        };

        var dfstree = new DFSpanningTree(g);
        var nodes = dfstree.iterNodes();

        // init
        nodes.forEach(function(n) {
            n.semi = undefined;
            n.ancestor = undefined;
            n.best = undefined;
            n.idom = undefined;
            n.samedom = undefined;
            n.bucket = [];
        });

        // iterate dfstree nodes in reverse order; excluding root node
        for (var i = nodes.length - 1; i > 0; i--) {
            var n = nodes[i];
            var p = dfstree.parent(n);
            var s = p;

            // calculate the semidominator of n
            // iterate predecessors of n in cfg
            g.predecessors(n).forEach(function(pred) {
                var v = dfstree.getNode(pred.key);
                var s_tag = (v.dfnum <= n.dfnum) ? v : AncestorWithLowestSemi(v).semi;

                if (s_tag.dfnum < s.dfnum) {
                    s = s_tag;
                }
            });

            n.semi = s;

            if (s.bucket.indexOf(n) === (-1)) {
                s.bucket.push(n);
            }

            Link(p, n);

            while (p.bucket.length > 0) {
                var v = p.bucket.pop();
                var y = AncestorWithLowestSemi(v);

                if (y.semi == v.semi) {
                    v.idom = p;
                } else {
                    v.samedom = y;
                }
            }
        }

        var edges = [];
        for (var i = 1; i < nodes.length; i++) {
            var n = nodes[i];

            if (n.samedom) {
                n.idom = n.samedom.idom;
            }

            edges.push([n.idom.key, n.key]);
        }

        var keys = Object.keys(dfstree.nodes);

        Directed.call(this, keys, edges, keys[0]);

        // modify nodes to hold only relevant data
        this.iterNodes().forEach(function(n) {
            n.idom = n.inbound[0];
        });
    }

    DominatorTree.prototype = Object.create(Directed.prototype);
    DominatorTree.prototype.constructor = DominatorTree;

    DominatorTree.prototype.dominates = function(v, u) {
        if (u == v) {
            return true;
        }

        if (u == this.root) {
            return false;
        }

        return this.dominates(v, u.idom);
    };

    DominatorTree.prototype.strictlyDominates = function(v, u) {
        return (v != u) && this.dominates(v, u);
    };

    DominatorTree.prototype.dominanceFrontier = function(n) {
        // for every node, the dominance frontier set is computed once and cached
        if (n.DF === undefined) {
            var S = [];

            // compute DF local
            this.cfg.successors(n).forEach(function(succ) {
                var y = this.getNode(succ.key);

                if (y.idom != n) {
                    if (S.indexOf(y) === (-1)) {
                        S.push(y);
                    }
                }
            }, this);

            // compute DF up
            this.successors(n).forEach(function(c) {
                this.dominanceFrontier(c).forEach(function(w) {
                    if (!this.dominates(n, w) || (n == w)) {
                        if (S.indexOf(w) === (-1)) {
                            S.push(w);
                        }
                    }
                }, this);
            }, this);

            n.DF = S;
        }

        return n.DF;
    };

    return {
        Directed        : Directed,
        DFSpanningTree  : DFSpanningTree,
        DominatorTree   : DominatorTree
    };
})();