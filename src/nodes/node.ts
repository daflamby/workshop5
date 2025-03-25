import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
};

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // Node state initialization
  let currentState: NodeState = {
    killed: false, // Initially, the node is running
    x: initialValue, // Initial value
    decided: null, // No decision yet
    k: null, // Step not started
  };

  // GET /status - Check if node is faulty or live
  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    res.status(200).send("live");
  });

  // GET /getState - Retrieve the current node state
  node.get("/getState", (req, res) => {
    res.json(currentState);
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);

    // Mark node as ready
    setNodeIsReady(nodeId);
  });

  return server;
}
