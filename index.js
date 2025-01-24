const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
  })
);

const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "forbidden access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kgmqz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //database
    const database = client.db("ProTracker");
    //employeeCollection
    const employeeCollection = database.collection("employeeCollection");
    //hrCollection
    const hrCollection = database.collection("hrCollection");
    //assetCollection
    const assetCollection = database.collection("assetCollection");
    //requestedAssetByEmployeeCollection
    const assetsRequestByEmployee = database.collection(
      "assetsRequestByEmployee"
    );

    //! jwt related
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    //!Checking users role
    app.get("/detailsOf/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };

        // Check if the user is in the HR collection
        const hrDetails = await hrCollection.findOne(query);
        if (hrDetails) {
          return res.status(200).send(hrDetails);
        }

        // Check if the user is in the Employee collection
        const employeeDetails = await employeeCollection.findOne(query);
        if (employeeDetails) {
          return res.status(200).send(employeeDetails);
        }

        // If no match is found
        return res.status(404).send({ message: "User not found" });
      } catch (error) {
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //! Employee related api
    app.post("/add-new-employee", async (req, res) => {
      const data = req.body;
      const query = { email: data.email };
      const find = await employeeCollection.findOne(query);
      if (find) {
        return res.send({ message: "user already exist" });
      }
      const result = await employeeCollection.insertOne(req.body);

      res.send(result);
    });

    app.get("/all-employee-list", verifyToken, async (req, res) => {
      const page = parseInt(req.query.page - 1);
      const limit = parseInt(req.query.limit);
      const query = { role: "n/a" };
      const result = await employeeCollection
        .find(query)
        .skip(page * limit)
        .limit(limit)
        .toArray();
      const totalCount = await employeeCollection.countDocuments({
        role: "n/a",
      });
      res.send({ allEmployees: result, totalCount });
    });

    app.get("/my-employee-list/:email", verifyToken, async (req, res) => {
      const page = parseInt(req.query.page - 1);
      const limit = parseInt(req.query.limit);
      const email = req.params.email;
      const result = await employeeCollection
        .find({ hrEmail: email })
        .skip(page * limit)
        .limit(limit)
        .toArray();
      const totalCount = await employeeCollection.countDocuments({
        hrEmail: email,
      });
      res.send({ myEmployeeList: result, totalCount });
    });

    app.get("/assets-of-company/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { HREmail: email };
      const page = parseInt(req.query.page) - 1 || 0;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search;
      const filterBy = req.query.filterBy;

      if (search) {
        filter.productName = { $regex: search, $options: "i" };
      }

      if (filterBy === "Available") {
        filter.productQuantity = { $gt: 0 };
      } else if (filterBy === "Out-of-stock") {
        filter.productQuantity = { $eq: 0 };
      } else if (filterBy === "returnable") {
        filter.productType = "returnable";
      } else if (filterBy === "non-returnable") {
        filter.productType = "non-returnable";
      }

      const requestedAssets = await assetCollection
        .find(filter)
        .skip(page * limit)
        .limit(limit)
        .toArray();
      const totalCount = await assetCollection.countDocuments({
        HREmail: email,
      });
      res.send({ requestedAssets, totalCount });
    });

    app.post("/assets-request-by-employee/:id", async (req, res) => {
      try {
        const data = req.body;
        const { email, AssetName, hrEmail } = data;
        const existingRequest = await assetsRequestByEmployee.findOne({
          email: email,
          AssetName: AssetName,
        });

        if (existingRequest) {
          return res.status(409).send({
            message: "You have already requested this asset.",
          });
        }

        const result = await assetsRequestByEmployee.insertOne(data);

        if (result.insertedId) {
          const updateResult = await assetCollection.updateOne(
            {
              HREmail: hrEmail,
              productName: AssetName,
              _id: new ObjectId(req.params.id),
            },
            { $inc: { productQuantity: -1 } }
          );

          if (updateResult.modifiedCount > 0) {
            return res.send({
              message: "Asset requested successfully, and quantity updated.",
              requestId: result.insertedId,
            });
          } else {
            return res.status(500).send({
              message: "Asset requested, but failed to update quantity.",
            });
          }
        }

        res.status(500).send({
          message: "Failed to request asset.",
        });
      } catch (error) {
        console.error("Error processing asset request:", error);
        res.status(500).send({
          message: "An error occurred while processing the request.",
        });
      }
    });

    app.get("/myRequestedAssetList/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const page = parseInt(req.query.page - 1) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search;
      const filterBy = req.query.filter;

      if (search) {
        filter.AssetName = { $regex: search, $options: "i" };
      }

      if (filterBy === "Pending") {
        filter.RequestStatus = "Pending";
      } else if (filterBy === "Approved") {
        filter.RequestStatus = "Approved";
      } else if (filterBy === "returnable") {
        filter.AssetType = "returnable";
      } else if (filterBy === "non-returnable") {
        filter.AssetType = "non-returnable";
      }

      const myRequestedAssetList = await assetsRequestByEmployee
        .find(filter)
        .skip(page * limit)
        .limit(limit)
        .toArray();
      const totalCount = await assetsRequestByEmployee.countDocuments({
        email: email,
      });
      res.send({ myRequestedAssetList, totalCount });
    });

    //return assets
    app.delete(`/return-asset/:id`, async (req, res) => {
      const id = req.params.id;
      const result = await assetsRequestByEmployee.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/myTeamMembers/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { hrEmail: email };
      const result = await employeeCollection.find(filter).toArray();
      const hrInfo = await hrCollection.findOne({
        email: email,
      });
      res.send({ result, hrInfo });
    });

    //! HR-related API
    //Register as a hr
    app.post("/add-hr", async (req, res) => {
      const employeeInfo = req.body;
      const email = employeeInfo.email;
      const existingHR = await hrCollection.findOne({
        email: email,
      });
      if (existingHR) {
        return res.send({
          message: "Employee with this email already exists.",
        });
      }
      const result = await hrCollection.insertOne(employeeInfo);
      res.send(result);
    });

    //Add Asset Request
    app.post("/add-asset", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await assetCollection.insertOne(data);
      res.send(result);
    });

    //Get All Assets Api
    app.get("/all-assets/:email", verifyToken, async (req, res) => {
      const page = parseInt(req.query.page) - 1 || 0;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search;
      const filterBy = req.query.filterBy;
      const sortBy = req.query.sortBy;

      // Filter
      const filter = {
        HREmail: req.params.email,
      };

      if (search) {
        filter.productName = { $regex: search, $options: "i" };
      }
      if (filterBy === "Available") {
        filter.productQuantity = { $gt: 0 };
      } else if (filterBy === "Out-of-stock") {
        filter.productQuantity = { $eq: 0 };
      } else if (filterBy === "returnable") {
        filter.productType = "returnable";
      } else if (filterBy === "non-returnable") {
        filter.productType = "non-returnable";
      }

      // Sort
      let sortQuery = {};
      if (sortBy === "Ascending") {
        sortQuery = { productQuantity: 1 };
      } else if (sortBy === "Descending") {
        sortQuery = { productQuantity: -1 };
      }

      try {
        const assets = await assetCollection
          .find(filter)
          .sort(sortQuery)
          .skip(page * limit)
          .limit(limit)
          .toArray();

        const totalCount = await assetCollection.countDocuments(filter);

        res.send({ assets, totalCount });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch assets" });
      }
    });

    //Delete Asset Api
    app.delete(
      `/delete-asset-from-assets/:id`,
      verifyToken,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await assetCollection.deleteOne(query);
        res.send(result);
      }
    );

    //update assets
    app.patch("/update-asset/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const result = await assetCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            productName: data.productName,
            productQuantity: data.productQuantity,
            productType: data.productType,
          },
        }
      );
      res.send(result);
    });

    //remove employee
    app.patch("/remove-employee/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      try {
        const result = await employeeCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { role: "n/a" },
            $unset: { companyLogo: "", companyName: "", hrEmail: "" },
          }
        );

        if (result.modifiedCount === 1) {
          const alsoDo = await hrCollection.updateOne(
            {
              email: data.hrEmail,
            },
            {
              $inc: {
                teamMembersLength: -1,
              },
            }
          );
          const alsoDo2 = await assetsRequestByEmployee.deleteMany({
            email: data.email,
          });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "An error occurred" });
      }
    });

    app.patch("/add-selected-to-team", verifyToken, async (req, res) => {
      const { employees } = req.body;

      if (!Array.isArray(employees) || employees.length === 0) {
        return res.status(400).send({
          success: false,
          message: "Provide a valid employees array.",
        });
      }

      try {
        const emails = employees.map((e) => e.email);
        const { hrName, hrEmail, hrPhoto, companyName, companyLogo } =
          employees[0];

        const result = await employeeCollection.updateMany(
          { email: { $in: emails } },
          {
            $set: {
              role: "employee",
              hrName,
              hrEmail,
              hrPhoto,
              companyName,
              companyLogo,
            },
          }
        );

        if (result.acknowledged) {
          await hrCollection.updateOne(
            { email: hrEmail },
            { $inc: { teamMembersLength: result.modifiedCount } }
          );
        }

        res.status(200).send({
          success: true,
          message: "Employees added to the team.",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Operation failed.",
          error: error.message,
        });
      }
    });

    //increase member limit
    app.patch("/increase-limit", async (req, res) => {
      const { membersLimit } = req.body;
      const { email } = req.body;
      const result = await hrCollection.updateOne(
        { email: email },
        { $inc: { packageLimit: +membersLimit } }
      );
      res.send(result);
    });

    //Get All requested Assets Api
    app.get("/assetRequests/:email", verifyToken, async (req, res) => {
      const page = parseInt(req.query.page - 1);
      const limit = parseInt(req.query.limit);
      const search = req.query.search;
      const filter = {
        hrEmail: req.params.email,
      };

      if (search) {
        filter.$or = [
          {
            email: { $regex: search, $options: "i" },
          },
          {
            RequestedBy: { $regex: search, $options: "i" },
          },
        ];
      }

      const result = await assetsRequestByEmployee
        .find(filter)
        .skip(page * limit)
        .limit(limit)
        .toArray();
      const totalCount = await assetsRequestByEmployee.countDocuments(filter);
      res.send({ assetRequests: result, totalCount });
    });

    app.put(`/handleRequest/:id`, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: req.body,
      };
      const result = await assetsRequestByEmployee.updateOne(query, updatedDoc);
      res.send(result);
    });

    //!payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const paymentAmount = parseInt(amount * 100); // Stripe
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: paymentAmount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to create payment intent" });
      }
    });

    app.post("/create-payment-intent-two", async (req, res) => {
      const { price } = req.body;
      const paymentAmount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: paymentAmount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// app.get("/", async (req, res) => {
//   res.send("a12 over and out");
// });

app.listen(port, () => {
  console.log(`a12 server is running on http://localhost:${port}`);
});
