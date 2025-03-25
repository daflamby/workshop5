import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import fetch from "node-fetch";

async function sendMessage(targetNodeId: number, value: Value) {
  const targetPort = BASE_NODE_PORT + targetNodeId;
  const url = `http://localhost:${targetPort}/message`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: nodeId, value }),
    });

    if (!response.ok) {
      console.error(`Failed to send message to node ${targetNodeId}`);
    }
  } catch (error) {
    console.error(`Error sending message to node ${targetNodeId}:`, error);
  }
}

type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
  messages: { [key: number]: Value };  // Store messages from other nodes
};

export async function node(
  nodeId: number,
  N: number,  // Total number of nodes in the network
  F: number,  // Number of faulty nodes in the network
  initialValue: Value,  // Initial value of the node
  isFaulty: boolean,  // Whether this node is faulty
  nodesAreReady: () => boolean,  // Check if all nodes are ready
  setNodeIsReady: (index: number) => void  // Mark the node as ready
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // Node state initialization
  let currentState: NodeState = {
    killed: false,
    x: initialValue,
    decided: null,
    k: 0,  // Step 0 at the start
    messages: {},
  };

  // GET /status - Check if node is faulty or live
  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  // GET /getState - Retrieve the current node state
  node.get("/getState", (req, res) => {
    res.json(currentState);
  });

  // POST /message - Handle messages from other nodes
  node.post("/message", (req, res) => {
  if (currentState.killed) {
    return res.status(400).send("Node is stopped");
  }

  const { senderId, value } = req.body;

  if (senderId === nodeId) {
    return res.status(400).send("Node cannot send messages to itself");
  }

  // Store the message from the sender
  currentState.messages[senderId] = value;

  // After receiving the message, check if enough messages are collected
  if (Object.keys(currentState.messages).length >= N - F) {
    // Start the decision-making process
    let votes = { 0: 0, 1: 0 };

    // Count the votes for each value
    Object.values(currentState.messages).forEach((v) => {
      if (v === 0) votes[0]++;
      if (v === 1) votes[1]++;
    });

    // If we have a majority, decide the value
    if (votes[0] >= N - F) {
      currentState.x = 0;
      currentState.decided = true;
    } else if (votes[1] >= N - F) {
      currentState.x = 1;
      currentState.decided = true;
    } else {
      currentState.x = "?";  // Unclear consensus, retry
      currentState.decided = false;  // Not yet decided
    }
  }

  return res.status(200).send("Message received");
});

  // GET /start - Start the consensus algorithm
  node.get("/start", async (req, res) => {
  if (currentState.killed) {
    return res.status(400).send("Node is stopped");
  }

  // Initialize the consensus step (k)
  console.log(`Node ${nodeId} starting consensus algorithm.`);
  currentState.k = 1;  // Start consensus from step 1

  // Broadcast the initial value to all other nodes
  for (let i = 0; i < N; i++) {
    if (i !== nodeId) {
      // Simulate sending the initial value to other nodes
      // This would typically be an HTTP POST to the /message route of other nodes
      await sendMessage(i, initialValue);
    }
  }

  return res.status(200).send("Consensus started");
});


  // GET /stop - Stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    console.log(`Node ${nodeId} stopping consensus algorithm.`);
    currentState.killed = true;
    return res.status(200).send("Consensus stopped");
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}


