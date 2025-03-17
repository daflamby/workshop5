import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

   // This variable stores the current state of the node
   let nodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: null,
    k: null,
  };

  // TODO implement this
  // this route allows retrieving the current status of the node
  // node.get("/status", (req, res) => {});
  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).json({ message: "faulty" });
    }
    return res.status(200).json({ message: "live" });
  });
  
  // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});
  node.post("/message", (req, res) => {
    if (nodeState.killed) {
      return res.status(400).json({ message: "Node is stopped" });
    }
    // TODO: Implement message handling logic for the consensus algorithm
    res.status(200).json({ message: "Message received" });
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});
  node.get("/start", async (req, res) => {
    if (nodeState.killed) {
      return res.status(400).json({ message: "Node is stopped" });
    }
    // TODO: Implement consensus algorithm logic
    res.status(200).json({ message: "Consensus algorithm started" });
  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  // node.get("/stop", async (req, res) => {});
  node.get("/stop", async (req, res) => {
    nodeState.killed = true;
    res.status(200).json({ message: "Node stopped" });
  });

  // TODO implement this
  // get the current state of a node
  // node.get("/getState", (req, res) => {});
  node.get("/getState", (req, res) => {
    res.status(200).json(nodeState);
  });
  
  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
