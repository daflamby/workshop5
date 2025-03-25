import bodyParser from "body-parser";
import express from "express";
import fetch from "node-fetch";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
  messages: Record<number, Value>; // Store received messages
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
    killed: false,
    x: initialValue,
    decided: null,
    k: null,
    messages: {},
  };

  // Function to send messages to other nodes
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

  // GET /status - Check if node is faulty or live
  node.get("/status", (req, res) => {
    return isFaulty ? res.status(500).send("faulty") : res.status(200).send("live");
  });

  // GET /getState - Retrieve the current node state
  node.get("/getState", (req, res) => {
    res.json(currentState);
  });

  // POST /message - Receive messages from other nodes
  node.post("/message", (req, res) => {
  if (currentState.killed) {
    return res.status(400).send("Node is stopped");
  }

  const { senderId, value } = req.body;
  if (senderId === nodeId) {
    return res.status(400).send("Node cannot send messages to itself");
  }

  currentState.messages[senderId] = value;

  // Check if enough messages have been received
  if (Object.keys(currentState.messages).length >= N - F) {
    let votes = { 0: 0, 1: 0 };
    Object.values(currentState.messages).forEach((v) => {
      if (v === 0) votes[0]++;
      if (v === 1) votes[1]++;
    });

    if (votes[0] >= N - F) {
      currentState.x = 0;
      currentState.decided = true;
    } else if (votes[1] >= N - F) {
      currentState.x = 1;
      currentState.decided = true;
    } else {
      currentState.x = "?";
      currentState.decided = false;
    }
  }

  return res.status(200).send("Message received");
});

  // GET /start - Start the consensus algorithm
  node.get("/start", async (req, res) => {
  if (currentState.killed) {
    return res.status(400).send("Node is stopped");
  }

  console.log(`Node ${nodeId} starting consensus algorithm.`);
  currentState.k = 1;

  // Send initial value to other nodes
  for (let i = 0; i < N; i++) {
    if (i !== nodeId) {
      await sendMessage(i, initialValue);
    }
  }

  return res.status(200).send("Consensus started");
});


  // GET /stop - Stop the consensus algorithm
  node.get("/stop", (req, res) => {
    currentState.killed = true;
    res.status(200).send("Node stopped");
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
