const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.PAYMENT_GETWAY_KEY);

const app = express();
const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);

const serviceAccount = JSON.parse(decoded);

// middlewares
app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lhf2ug2.mongodb.net/?appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("pro-curier-db");
    const userCollection = db.collection("users");
    const parcelsCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const ridersCollection = db.collection("riders");
    const trackingsCollection = db.collection("trackings");

    // custom middlewears
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).send({ message: "invalid or expired token" });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyRider = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "rider") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await userCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "user already exists", inserted: false });
      }
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    // Current authenticated user's profile
    app.get("/users/me", verifyFBToken, async (req, res) => {
      try {
        const email = req.user.email;

        const user = await userCollection.findOne(
          { email },
          {
            projection: {
              password: 0,
            },
          },
        );

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send(user);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        res.status(500).send({
          message: "Failed to fetch profile",
        });
      }
    });

    // Update only the authenticated user's editable profile fields.
    // Email and role remain controlled by authentication/admin APIs.
    app.patch("/users/me", verifyFBToken, async (req, res) => {
      try {
        const email = req.user.email;
        const { name, displayName, photoUrl, photoURL, phone, address } =
          req.body;

        const updateFields = {};

        if (name !== undefined) updateFields.name = name;
        if (displayName !== undefined) updateFields.displayName = displayName;
        if (photoUrl !== undefined) updateFields.photoUrl = photoUrl;
        if (photoURL !== undefined) updateFields.photoURL = photoURL;
        if (phone !== undefined) updateFields.phone = phone;
        if (address !== undefined) updateFields.address = address;

        if (Object.keys(updateFields).length === 0) {
          const currentUser = await userCollection.findOne({ email });
          if (!currentUser) {
            return res.status(404).send({
              message: "User not found",
            });
          }

          return res.send({
            message: "No profile changes were provided",
            user: currentUser,
          });
        }

        updateFields.updated_at = new Date().toISOString();

        const result = await userCollection.findOneAndUpdate(
          { email },
          { $set: updateFields },
          { returnDocument: "after" },
        );

        const updatedUser = result?.value ?? result;

        if (!updatedUser) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send({
          message: "Profile updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error("Failed to update profile:", error);
        res.status(500).send({
          message: "Failed to update profile",
        });
      }
    });

    app.get("/users/search", async (req, res) => {
      const emailQuery = req.query.email;

      if (!emailQuery) {
        return res.status(400).send({
          message: "Missing email query",
        });
      }

      const regex = new RegExp(emailQuery, "i");

      try {
        const users = await userCollection
          .find({ email: { $regex: regex } })
          .project({
            email: 1,
            created_at: 1,
            role: 1,
          })
          .limit(10)
          .toArray();

        res.send(users);
      } catch (err) {
        console.error("SEARCH USER ERROR 👉", err);
        res.status(500).send({
          message: "Failed to search users",
          error: err.message,
        });
      }
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;

        if (!["admin", "user"].includes(role)) {
          return res.status(400).send({
            message: "Invalid role",
          });
        }

        try {
          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } },
          );

          res.send({
            message: `User role updated to ${role}`,
            result,
          });
        } catch (error) {
          res.status(500).send({
            message: "Failed to update user role",
            error: error.message,
          });
        }
      },
    );

    // find role base user
    app.get("/users/role", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({
            message: "Email is required",
          });
        }
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }
        res.send({
          email,
          role: user.role || "user",
        });
      } catch (error) {
        res.status(500).send({
          message: "Failed to get user role",
          error: error.message,
        });
      }
    });


    // Role-aware dashboard statistics
    app.get("/dashboard/stats", verifyFBToken, async (req, res) => {
      try {
        const email = req.user.email;
        const currentUser = await userCollection.findOne({ email });

        if (!currentUser) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        const role = currentUser.role || "user";

        let parcelQuery = {};

        if (role === "user") {
          parcelQuery = { created_by: email };
        } else if (role === "rider") {
          parcelQuery = { assigned_rider_email: email };
        }

        const [
          totalParcels,
          delivered,
          pending,
          inTransit,
          riderAssigned,
        ] = await Promise.all([
          parcelsCollection.countDocuments(parcelQuery),
          parcelsCollection.countDocuments({
            ...parcelQuery,
            delivery_status: "delivered",
          }),
          parcelsCollection.countDocuments({
            ...parcelQuery,
            delivery_status: "pending",
          }),
          parcelsCollection.countDocuments({
            ...parcelQuery,
            delivery_status: "in_transit",
          }),
          parcelsCollection.countDocuments({
            ...parcelQuery,
            delivery_status: "rider_assigned",
          }),
        ]);

        const statusCounts = await parcelsCollection
          .aggregate([
            { $match: parcelQuery },
            {
              $group: {
                _id: "$delivery_status",
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                status: "$_id",
                count: 1,
              },
            },
            { $sort: { status: 1 } },
          ])
          .toArray();

        const paymentQuery =
          role === "user" ? { email } : role === "admin" ? {} : null;

        let paymentStats = {
          totalPayments: 0,
          totalRevenue: 0,
        };

        if (paymentQuery) {
          const paymentResult = await paymentCollection
            .aggregate([
              { $match: paymentQuery },
              {
                $group: {
                  _id: null,
                  totalPayments: { $sum: 1 },
                  totalRevenue: {
                    $sum: {
                      $convert: {
                        input: "$amount",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  },
                },
              },
            ])
            .toArray();

          paymentStats = {
            totalPayments: paymentResult[0]?.totalPayments || 0,
            totalRevenue: paymentResult[0]?.totalRevenue || 0,
          };
        }

        const response = {
          role,
          totalParcels,
          delivered,
          pending,
          inTransit,
          riderAssigned,
          statusCounts,
          ...paymentStats,
        };

        if (role === "admin") {
          const [totalUsers, totalRiders, activeRiders] = await Promise.all([
            userCollection.countDocuments({}),
            userCollection.countDocuments({ role: "rider" }),
            ridersCollection.countDocuments({ status: "approved" }),
          ]);

          response.totalUsers = totalUsers;
          response.totalRiders = totalRiders;
          response.activeRiders = activeRiders;
        }

        if (role === "rider") {
          const completed = await parcelsCollection
            .find({
              assigned_rider_email: email,
              delivery_status: {
                $in: ["delivered", "service_center_delivered"],
              },
            })
            .project({
              cost: 1,
              senderDistrict: 1,
              receiverDistrict: 1,
            })
            .toArray();

          const totalEarnings = completed.reduce((sum, parcel) => {
            const cost = Number(parcel.cost) || 0;
            const sameDistrict =
              parcel.senderDistrict === parcel.receiverDistrict;
            return sum + (sameDistrict ? cost * 0.8 : cost * 0.3);
          }, 0);

          response.completedDeliveries = completed.length;
          response.totalEarnings = totalEarnings;
        }

        res.send(response);
      } catch (error) {
        console.error("Failed to load dashboard stats:", error);
        res.status(500).send({
          message: "Failed to load dashboard statistics",
        });
      }
    });

    // parcel api
    // Supports the existing filters plus optional search, sorting and pagination.
    // Legacy requests without page/limit still return the original array shape.
    app.get("/parcels", verifyFBToken, async (req, res) => {
      try {
        const {
          email,
          payment_status,
          delivery_status,
          search,
          sortBy = "creation_date",
          sortOrder = "desc",
          page,
          limit,
        } = req.query;

        const query = {};

        if (email) {
          query.created_by = email;
        }

        if (payment_status) {
          query.payment_status = payment_status;
        }

        if (delivery_status) {
          query.delivery_status = delivery_status;
        }

        // Search across the parcel fields that are actually used by the client.
        if (search && String(search).trim()) {
          const searchRegex = new RegExp(String(search).trim(), "i");

          query.$or = [
            { tracking_id: searchRegex },
            { senderName: searchRegex },
            { receiverName: searchRegex },
            { senderEmail: searchRegex },
            { receiverEmail: searchRegex },
            { senderDistrict: searchRegex },
            { receiverDistrict: searchRegex },
            { type: searchRegex },
          ];
        }

        // Only allow known sortable fields so arbitrary MongoDB fields
        // cannot be supplied through the query string.
        const allowedSortFields = {
          creation_date: "creation_date",
          cost: "cost",
          payment_status: "payment_status",
          delivery_status: "delivery_status",
          tracking_id: "tracking_id",
        };

        const selectedSortField =
          allowedSortFields[String(sortBy)] || "creation_date";

        const direction =
          String(sortOrder).toLowerCase() === "asc" ? 1 : -1;

        const sort = {
          [selectedSortField]: direction,
        };

        // Keep the old response shape for existing frontend requests.
        const hasPagination = page !== undefined || limit !== undefined;

        if (!hasPagination) {
          const result = await parcelsCollection
            .find(query)
            .sort(sort)
            .toArray();

          return res.send(result);
        }

        const parsedPage = Number.parseInt(page, 10);
        const parsedLimit = Number.parseInt(limit, 10);

        const currentPage =
          Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        const pageSize =
          Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 50)
            : 10;

        const total = await parcelsCollection.countDocuments(query);
        const totalPages = Math.ceil(total / pageSize);

        const result = await parcelsCollection
          .find(query)
          .sort(sort)
          .skip((currentPage - 1) * pageSize)
          .limit(pageSize)
          .toArray();

        return res.send({
          data: result,
          pagination: {
            total,
            page: currentPage,
            limit: pageSize,
            totalPages,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1 && total > 0,
          },
        });
      } catch (error) {
        console.error("Failed to fetch parcels:", error);
        return res.status(500).send({
          message: "Failed to fetch parcels",
          error: error.message,
        });
      }
    });

    // get a specific parcel by ID
    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const parcel = await parcelsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!parcel) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        res.send(parcel);
      } catch (error) {
        console.log("Error fetching parcel", error);
        res.status(500).send({ message: "Failed to fetch parcel" });
      }
    });

    // aggregate api
    app.get("/parcels/delivery/status-count", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$delivery_status",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $project: {
            status: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ];
      const result = await parcelsCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const query = { email: userEmail };
        const options = { sort: { paid_at: -1 } };

        const payments = await paymentCollection.find(query, options).toArray();

        res.send(payments);
      } catch (error) {
        console.log("Error fetching payment history", error);
        res.status(500).send({ message: "Failed to get payments" });
      }
    });

    // riders api
    app.post("/riders", async (req, res) => {
      const rider = req.body;

      rider.status = "pending";
      ((rider.paid_at_string = new Date().toISOString()),
        (rider.paid_at = new Date()));

      const result = await ridersCollection.insertOne(rider);
      res.send(result);
    });

    app.get("/riders/pending", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const { page, limit, search = "" } = req.query;
        const usePagination = page !== undefined || limit !== undefined || search.trim();

        const baseQuery = { status: "pending" };

        if (!usePagination) {
          const pendingRiders = await ridersCollection.find(baseQuery).toArray();
          return res.send(pendingRiders);
        }

        const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
        const pageLimit = Math.min(
          Math.max(Number.parseInt(limit, 10) || 10, 1),
          50,
        );

        const query = { ...baseQuery };
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
          const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          query.$or = [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { district: searchRegex },
          ];
        }

        const total = await ridersCollection.countDocuments(query);
        const totalPages = Math.ceil(total / pageLimit);
        const pendingRiders = await ridersCollection
          .find(query)
          .sort({ _id: -1 })
          .skip((currentPage - 1) * pageLimit)
          .limit(pageLimit)
          .toArray();

        res.send({
          data: pendingRiders,
          pagination: {
            total,
            page: currentPage,
            limit: pageLimit,
            totalPages,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1,
          },
        });
      } catch (error) {
        console.error("Failed to load pending riders:", error);
        res.status(500).send({
          message: "Failed to load pending riders",
          error: error.message,
        });
      }
    });

    // active riders api
    app.get("/riders/active", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const { page, limit, search = "" } = req.query;
        const usePagination = page !== undefined || limit !== undefined || search.trim();

        const baseQuery = { status: "approved" };

        if (!usePagination) {
          const result = await ridersCollection.find(baseQuery).toArray();
          return res.send(result);
        }

        const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
        const pageLimit = Math.min(
          Math.max(Number.parseInt(limit, 10) || 10, 1),
          50,
        );

        const query = { ...baseQuery };
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
          const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          query.$or = [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { district: searchRegex },
          ];
        }

        const total = await ridersCollection.countDocuments(query);
        const totalPages = Math.ceil(total / pageLimit);
        const result = await ridersCollection
          .find(query)
          .sort({ _id: -1 })
          .skip((currentPage - 1) * pageLimit)
          .limit(pageLimit)
          .toArray();

        res.send({
          data: result,
          pagination: {
            total,
            page: currentPage,
            limit: pageLimit,
            totalPages,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1,
          },
        });
      } catch (error) {
        console.error("Failed to load active riders:", error);
        res.status(500).send({
          message: "Failed to load active riders",
          error: error.message,
        });
      }
    });

    // pending riders updated api
    app.patch("/riders/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status, email } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { status },
      };

      try {
        const result = await ridersCollection.updateOne(query, updatedDoc);
        if (status === "approved") {
          const useQuery = { email };
          const userUpdateDoc = {
            $set: {
              role: "rider",
            },
          };
          const roleResult = await userCollection.updateOne(
            useQuery,
            userUpdateDoc,
          );
          console.log(roleResult);
        }
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "failed to update rider status", err });
      }
    });

    app.get(
      "/riders/available",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { district } = req.query;

        const riders = await ridersCollection
          .find({
            status: "approved",
            district: district,
          })
          .toArray();

        res.send(riders);
      },
    );

    // riders aggregate api
    app.get("/riders/parcels/status-count/:email", async (req, res) => {
      const email = req.params.email;

      const result = await parcelsCollection
        .aggregate([
          {
            $match: {
              assigned_rider_email: email,
            },
          },
          {
            $group: {
              _id: "$delivery_status",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              status: "$_id",
              count: 1,
              _id: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    app.patch(
      "/parcels/:parcelId/assign-rider",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { parcelId } = req.params;
        const { riderId, riderName, riderEmail } = req.body;

        if (!riderId || !riderName) {
          return res.status(400).send({
            message: "Rider ID and name are required",
          });
        }

        try {
          // 1️⃣ Update parcel
          const parcelResult = await parcelsCollection.updateOne(
            { _id: new ObjectId(parcelId) },
            {
              $set: {
                delivery_status: "rider_assigned",
                assigned_rider_id: new ObjectId(riderId),
                assigned_rider_name: riderName,
                assigned_rider_email: riderEmail,
                assigned_at: new Date(),
              },
            },
          );

          //  Update rider status
          const riderResult = await ridersCollection.updateOne(
            { _id: new ObjectId(riderId) },
            {
              $set: {
                work_status: "in_delivery",
              },
            },
          );

          res.send({
            success: true,
            parcelResult,
            riderResult,
          });
        } catch (error) {
          res.status(500).send({
            message: "Failed to assign rider",
            error: error.message,
          });
        }
      },
    );

    // get pending delivery tasks for a rider
    app.get("/rider/parcels", verifyFBToken, verifyRider, async (req, res) => {
      try {
        const riderEmail = req.user.email;
        const { page, limit, search = "" } = req.query;
        const usePagination = page !== undefined || limit !== undefined || search.trim();

        const baseQuery = {
          assigned_rider_email: riderEmail,
          delivery_status: { $in: ["rider_assigned", "in_transit"] },
        };

        if (!usePagination) {
          const tasks = await parcelsCollection.find(baseQuery).toArray();
          return res.send(tasks);
        }

        const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
        const pageLimit = Math.min(
          Math.max(Number.parseInt(limit, 10) || 10, 1),
          50,
        );

        const query = { ...baseQuery };
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
          const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          query.$or = [
            { parcelName: searchRegex },
            { tracking_id: searchRegex },
            { sender_name: searchRegex },
            { receiver_name: searchRegex },
            { sender_district: searchRegex },
            { receiver_district: searchRegex },
          ];
        }

        const total = await parcelsCollection.countDocuments(query);
        const totalPages = Math.ceil(total / pageLimit);
        const tasks = await parcelsCollection
          .find(query)
          .sort({ updated_at: -1 })
          .skip((currentPage - 1) * pageLimit)
          .limit(pageLimit)
          .toArray();

        res.send({
          data: tasks,
          pagination: {
            total,
            page: currentPage,
            limit: pageLimit,
            totalPages,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1,
          },
        });
      } catch (error) {
        res.status(500).send({
          message: "Failed to load rider parcels",
          error: error.message,
        });
      }
    });

    app.patch(
      "/parcels/:id/status",
      verifyFBToken,
      verifyRider,
      async (req, res) => {
        const parcelId = req.params.id;
        const { status } = req.body;
        const updatedDoc = { delivery_status: status };
        if (status === "in_transit") {
          updatedDoc.picked_at = new Date().toISOString();
        } else if (status === "delivered") {
          updatedDoc.delivered_at = new Date().toISOString();
        }

        try {
          const result = await parcelsCollection.updateOne(
            { _id: new ObjectId(parcelId) },
            {
              $set: updatedDoc,
            },
          );

          res.send(result);
        } catch (error) {
          console.error("Failed to update parcel status:", error);
          res.status(500).send({
            message: "Failed to update parcel status",
            error: error.message,
          });
        }
      },
    );

    app.get(
      "/rider/completed-parcels",
      verifyFBToken,
      verifyRider,
      async (req, res) => {
        try {
          const riderEmail = req.user.email;
          const { page, limit, search = "" } = req.query;
          const usePagination = page !== undefined || limit !== undefined || search.trim();

          const baseQuery = {
            assigned_rider_email: riderEmail,
            delivery_status: {
              $in: ["delivered", "service_center_delivered"],
            },
          };

          if (!usePagination) {
            const completedParcels = await parcelsCollection
              .find(baseQuery)
              .sort({ updated_at: -1 })
              .toArray();

            return res.send(completedParcels);
          }

          const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
          const pageLimit = Math.min(
            Math.max(Number.parseInt(limit, 10) || 10, 1),
            50,
          );

          const query = { ...baseQuery };
          const trimmedSearch = search.trim();

          if (trimmedSearch) {
            const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [
              { parcelName: searchRegex },
              { tracking_id: searchRegex },
              { sender_name: searchRegex },
              { receiver_name: searchRegex },
              { sender_district: searchRegex },
              { receiver_district: searchRegex },
            ];
          }

          const total = await parcelsCollection.countDocuments(query);
          const totalPages = Math.ceil(total / pageLimit);
          const completedParcels = await parcelsCollection
            .find(query)
            .sort({ updated_at: -1 })
            .skip((currentPage - 1) * pageLimit)
            .limit(pageLimit)
            .toArray();

          res.send({
            data: completedParcels,
            pagination: {
              total,
              page: currentPage,
              limit: pageLimit,
              totalPages,
              hasNextPage: currentPage < totalPages,
              hasPreviousPage: currentPage > 1,
            },
          });
        } catch (error) {
          console.error("Failed to load completed deliveries:", error);
          res.status(500).send({
            message: "Failed to load completed deliveries",
            error: error.message,
          });
        }
      },
    );

    app.patch("/parcels/:id/cashout", verifyFBToken, async (req, res) => {
      try {
        const parcelId = req.params.id;
        const riderEmail = req.user.email;

        const parcel = await parcelsCollection.findOne({
          _id: new ObjectId(parcelId),
          assigned_rider_email: riderEmail,
          delivery_status: {
            $in: ["delivered", "service_center_delivered"],
          },
        });

        if (!parcel) {
          return res.status(403).send({
            message: "Not eligible for cashout",
          });
        }

        if (parcel.cashout_status === "paid") {
          return res.status(400).send({
            message: "Already paid",
          });
        }

        await parcelsCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: {
              cashout_status: "paid",
              cashed_out_at: new Date(),
            },
          },
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({
          message: "Cashout failed",
          error: error.message,
        });
      }
    });

    // tracking rider status updated anyone can track
    app.get("/trackings/:trackingId", async (req, res) => {
      const trackingId = req.params.trackingId;

      const updates = await trackingsCollection
        .find({ tracking_id: trackingId })
        .sort({ timestamp: 1 }) // sort by time ascending
        .toArray();

      res.json(updates);
    });

    app.post("/trackings", async (req, res) => {
      const update = req.body;

      // ensure correct timestamp
      update.timestamp = new Date();

      if (!update.tracking_id || !update.status) {
        return res.status(400).json({
          message: "tracking_id and status are required.",
        });
      }

      const result = await trackingsCollection.insertOne(update);

      res.status(201).json(result);
    });

    app.post("/tracking", async (req, res) => {
      const { tracking_id, parcel_id, status, message, updated_by } = req.body;
      const log = {
        tracking_id,
        parcel_id: parcel_id ? new ObjectId(parcel_id) : status,
        message,
        time: new Date(),
        updated_by,
      };
      const result = await trackingsCollection.insertOne(log);
      res.send({ success: true, insertedId: result.insertedId });
    });

    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, amount, paymentMethod, transactionId } =
          req.body;
        //  Update parcel only if unpaid
        const updateResult = await parcelsCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: {
              payment_status: "paid",
            },
          },
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(400).send({
            message: "Parcel not found or already paid",
          });
        }

        //  Insert payment record
        const paymentDoc = {
          parcel_id: new ObjectId(parcelId),
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date(),
        };

        const paymentResult = await paymentCollection.insertOne(paymentDoc);

        res.status(201).send({
          message: "Payment recorded and parcel marked as paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Payment processing failed",
        });
      }
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const amountInCents = req.body.amountInCents;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents, // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    //  DELETE PARCEL API
    app.delete("/parcels/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await parcelsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to delete parcel",
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

run()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  })
  .catch(console.error);
