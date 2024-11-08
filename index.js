import express from "express"
import bodyParser from "body-parser";
import pg from 'pg';
import path from "path";
import { fileURLToPath } from 'url';
import multer from 'multer';
import session from 'express-session'; // Import express-session
import env from "dotenv"

// Setup__dirname for ES6 modules

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Set up multer for handling file uploads
const storage = multer.memoryStorage(); // Store files in memory as Buffer
const upload = multer({ storage: storage });

const app = express();
const port = 3000;
env.config();
const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// Set up the view engine to use EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public', 'views'));

let userid=null
// Setup session middleware
app.use(session({
    secret: process.env.SESSION_SECRET, // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.get("/", async (req, res) => {
    try {
        // Fetch posts with user profile data and interactions
        const result = await db.query(`
            SELECT 
                posts.*, 
                user_profiles.name, 
                user_profiles.profile_image,
                COALESCE(SUM(post_interactions.likes), 0) AS total_likes,
                COALESCE(SUM(post_interactions.dislikes), 0) AS total_dislikes,
                COALESCE(COUNT(answer.answer_id), 0) AS total_comments  -- Count answers as comments
            FROM posts
            JOIN user_profiles ON posts.user_id = user_profiles.user_id
            LEFT JOIN post_interactions ON posts.post_id = post_interactions.post_id
            LEFT JOIN answer ON posts.post_id = answer.post_id  -- Join with answer table to count comments
            GROUP BY posts.post_id, user_profiles.name, user_profiles.profile_image
        `);

        const posts = result.rows;
       
        

       // Fetch answers for each post
    const postsWithAnswers = await Promise.all(
    posts.map(async (post) => {
        const answers = await db.query(`
            SELECT a.answer_title, a.answer_description, a.answer_date, up.name, up.profile_image
            FROM Answer a
            JOIN user_profiles up ON a.user_id = up.user_id
            WHERE a.post_id = $1
        `, [post.post_id]);
        
        // Attach the answers to the post object
        return {
            ...post,
            answers: answers.rows // Attach the answers to the post
        };
    })
);



        // Render posts with answers
        res.render('posts', { posts: postsWithAnswers }); // Sending posts with answers to the EJS template
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


app.post("/login", async (req, res) => {

    const email = req.body.loginEmail
    const password = req.body.loginPassword
    try {
        const result = await db.query("SELECT * from users where email= $1", [
            email,
        ]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedPassword = user.password;
            if (password === storedPassword) {
                 req.session.userId=user.user_id
                 res.redirect("/profile");
                 
            }
            else {
                res.sendFile("Incorrect Password");
            }
        } else {
            res.send("User not found");
        }
    } catch (err) {
        console.log(err);
    }



});
app.get("/gotoprofile", async (req, res) => {
    const id = req.session.userId;
    if (!id) {  // Check if `id` is null or undefined
        res.json({ message: "You are not logged in" });
    } else {
        res.redirect("/profile");
    }
});

app.post("/register", async (req, res) => {
    const email = req.body.registerEmail;
    const password = req.body.registerPassword;
    const conformPassword = req.body.registerConfirmPassword;

    // Check if the email already exists
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (password === conformPassword) {
        if (checkResult.rows.length === 0) {
            try {
                // Insert the user into the 'users' table
                const result = await db.query(
                    "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING user_id", 
                    [email, password]
                );

                // Get the newly inserted user_id
                const user_id = result.rows[0].user_id;

                // Now, insert into the 'user_profiles' table with the new user_id
                const profileResult = await db.query(
                    "INSERT INTO user_profiles (user_id) VALUES ($1)", 
                    [user_id]
                );

                console.log("User registered successfully");
                res.redirect("/"); // Redirect to home page after successful registration
            } catch (error) {
                console.error("Error during user registration:", error);
                res.send("An error occurred during registration.");
            }
        } else {
            res.send("Email already exists.");
        }
    } else {
        res.send("Password and confirm password do not match.");
    }
});


app.post("/newPost",async(req,res)=>{
    const title=req.body.title

    const description=req.body.description
    console.log(title)
    console.log(description)
    try{
        const user=req.session.userId;
        const result=await db.query("INSERT INTO posts (title,description,user_id) VALUES ($1,$2,$3)",[
            title,description,user]
        
    );
    res.redirect("/profile");


        
    }catch(err){
        console.log(err);
    }

});
app.post("/updateProfile", upload.fields([{ name: 'profileImage' }, { name: 'backgroundImage' }]), async (req, res) => {
    const name = req.body.name;

    // Check if the files exist
    if (!req.files || !req.files.profileImage || !req.files.backgroundImage) {
        return res.status(400).send("Both profile and background images are required.");
    }

    const profileImage = req.files.profileImage[0].buffer;  // Access profile image file
    const backgroundImage = req.files.backgroundImage[0].buffer;  // Access background image file
    const userId = req.session.userId; // Get the user ID from the session

    try {
        // Update the user profile with the new name, profile image, and background image based on user ID
        const result = await db.query(`
            UPDATE user_profiles 
            SET name = $1, profile_image = $2, background_image = $3
            WHERE user_id = $4
        `, [name, profileImage, backgroundImage, userId]);

        res.redirect("/profile");
       
    } catch (err) {
        console.log("Error updating profile:", err);
        res.status(500).send("An error occurred while updating the profile.");
    }
});

// Like a post
app.post('/like-post/:post_id', async (req, res) => {
    const { post_id } = req.params;
    const userid = req.session.userId; // Assume user is logged in
    if(userid==null){
        return res.status(401).json({ message: 'You must login to like' });
    }else{
        try {
            // Check if the user has already interacted with the post
            const interaction = await db.query(
                `SELECT * FROM post_interactions WHERE post_id = $1 AND user_id = $2`,
                [post_id, userid]
            );
    
            if (interaction.rows.length > 0) {
                if (interaction.rows[0].likes > 0) {
                    // User has already liked the post, so we do not update
                    return res.status(400).json({ message: 'You have already liked this post' });
                } else {
                    // Update the like count
                    await db.query(
                        `UPDATE post_interactions SET likes = 1, dislikes = 0 WHERE post_id = $1 AND user_id = $2`,
                        [post_id, userid]
                    );
                }
            } else {
                // Create a new interaction with 1 like
                await db.query(
                    `INSERT INTO post_interactions (post_id, user_id, likes, dislikes) VALUES ($1, $2, 1, 0)`,
                    [post_id, userid]
                );
            }
            
            // Get the updated likes and dislikes count
            const updatedPost = await db.query(
                `SELECT SUM(likes) as total_likes, SUM(dislikes) as total_dislikes FROM post_interactions WHERE post_id = $1`,
                [post_id]
            );
            
            res.json({
                total_likes: updatedPost.rows[0].total_likes || 0,
                total_dislikes: updatedPost.rows[0].total_dislikes || 0
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }

    }
    
    
});
// Dislike a post
app.post('/dislike-post/:post_id', async (req, res) => {
    const { post_id } = req.params;
    const user_id = req.session.userId;
    if(user_id==null){
        return res.status(401).json({ message: 'You must be logged in to dislike '});
    }else{
        try {
            // Check if the user has already interacted with the post
            const interaction = await db.query(
                `SELECT * FROM post_interactions WHERE post_id = $1 AND user_id = $2`,
                [post_id, user_id]
            );
    
            if (interaction.rows.length > 0) {
                if (interaction.rows[0].dislikes > 0) {
                    // User has already disliked the post, so we do not update
                    return res.status(400).json({ message: 'You have already disliked this post' });
                } else {
                    // Update the dislike count
                    await db.query(
                        `UPDATE post_interactions SET dislikes = 1, likes = 0 WHERE post_id = $1 AND user_id = $2`,
                        [post_id, user_id]
                    );
                }
            } else {
                // Create a new interaction with 1 dislike
                await db.query(
                    `INSERT INTO post_interactions (post_id, user_id, likes, dislikes) VALUES ($1, $2, 0, 1)`,
                    [post_id, user_id]
                );
            }
    
           // Get the updated likes and dislikes count
           const updatedPost = await db.query(
            `SELECT SUM(likes) as total_likes, SUM(dislikes) as total_dislikes FROM post_interactions WHERE post_id = $1`,
            [post_id]
        );
            
            // Return both likes and dislikes in the response
            res.json({
                total_likes: updatedPost.rows[0].total_likes || 0,
                total_dislikes: updatedPost.rows[0].total_dislikes || 0
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }

    }
    
    
});

app.post('/submitAnswer/:post_id',async(req,res)=>{
    const title=req.body.answerTitle;
    const description=req.body.answerDescription;
    const { post_id } = req.params;
    const user_id = req.session.userId;
    if(user_id==null){
        return res.status(401).json({ message: 'You must be logged in to comment '});
    }else{
        try{
             // Create a new interaction with 1 dislike
             await db.query(
                `INSERT INTO answer (answer_title, answer_description, post_id, user_id) VALUES ($1, $2, $3, $4)`,
                [title,description,post_id, user_id]);
                res.redirect("/");
        }
        catch(err){
            console.log(err);
        }


    }

});

app.get('/readAnswer/:post_id',async(req,res)=>{
    const { post_id } = req.params;
    try{
        const answers = await db.query(`
            SELECT a.answer_title, a.answer_description, a.answer_date, up.name, up.profile_image
            FROM Answer a
            JOIN user_profiles up ON a.user_id = up.user_id
            WHERE a.post_id = $1
        `, [post_id]);
        res.render('posts', { answers: answers.rows }); // Render EJS page with answers
    }catch(error){
        console.error("Error fetching answers:", error);
        res.status(500).json({ message: 'An error occurred while fetching answers.' });

    }
  



});

// Route for Trending posts (more than 5 likes) along with answers
app.get("/category/:categoryName", async (req, res) => {
    const { categoryName } = req.params;

if (categoryName === "Trending") {
    try {
        // Query to fetch trending posts with more than 5 likes
        const result = await db.query(`
            SELECT posts.*, user_profiles.name, user_profiles.profile_image, 
                   COALESCE(SUM(post_interactions.likes), 0) AS total_likes,
                   COALESCE(SUM(post_interactions.dislikes), 0) AS total_dislikes,
                   COALESCE(COUNT(answer.answer_id), 0) AS total_comments
            FROM posts
            JOIN user_profiles ON posts.user_id = user_profiles.user_id
            LEFT JOIN post_interactions ON posts.post_id = post_interactions.post_id
            LEFT JOIN answer ON posts.post_id = answer.post_id
            GROUP BY posts.post_id, user_profiles.name, user_profiles.profile_image
            HAVING COALESCE(SUM(post_interactions.likes), 0) > 5
        `);
        

        const posts = result.rows;

        // Fetch answers for each post
        const postsWithAnswers = await Promise.all(
            posts.map(async (post) => {
                const answers = await db.query(`
                    SELECT a.answer_title, a.answer_description, a.answer_date, up.name, up.profile_image
                    FROM answer a
                    JOIN user_profiles up ON a.user_id = up.user_id
                    WHERE a.post_id = $1
                `, [post.post_id]);

                // Attach answers to the post object
                return {
                    ...post,
                    answers: answers.rows
                };
            })
        );

        // Render the page with the fetched posts and their answers
        res.render("categoryPage", { posts: postsWithAnswers });

    } catch (error) {
        console.error("Error fetching trending posts:", error.message, error.stack);
        res.status(500).send("Error retrieving trending posts.");
    }
}
    else{
        try {
            const result = await db.query(`
                SELECT posts.*, user_profiles.name, user_profiles.profile_image,
                       COALESCE(SUM(post_interactions.likes), 0) AS total_likes,
                       COALESCE(SUM(post_interactions.dislikes), 0) AS total_dislikes,
                       COALESCE(COUNT(answer.answer_id), 0) AS total_comments
                FROM posts
                JOIN user_profiles ON posts.user_id = user_profiles.user_id
                LEFT JOIN post_interactions ON posts.post_id = post_interactions.post_id
                LEFT JOIN answer ON posts.post_id = answer.post_id
                WHERE posts.title ILIKE '%' || $1 || '%' OR posts.description ILIKE '%' || $1 || '%'
                GROUP BY posts.post_id, user_profiles.name, user_profiles.profile_image
            `, [categoryName]);
            
            const posts = result.rows;
    
            // Fetch answers for each post
            const postsWithAnswers = await Promise.all(
                posts.map(async (post) => {
                    const answers = await db.query(`
                        SELECT a.answer_title, a.answer_description, a.answer_date, up.name, up.profile_image
                        FROM answer a
                        JOIN user_profiles up ON a.user_id = up.user_id
                        WHERE a.post_id = $1
                    `, [post.post_id]);
    
                    return {
                        ...post,
                        answers: answers.rows // Attach the answers to the post
                    };
                })
            );
    
            res.render("categoryPage", { posts: postsWithAnswers });
        } catch (error) {
            console.error("Error fetching food posts:", error);
            res.status(500).send("Error retrieving food posts.");
        }
    }
  
});




app.get("/profile", async (req, res) => {
    try {
        const userId = req.session.userId;

        // Fetch user profile information
        const resultProfile = await db.query("SELECT * FROM user_profiles WHERE user_id = $1", [userId]);
        
        if (resultProfile.rows.length > 0) {
            const profile = resultProfile.rows[0]; // Get user profile data

            // Fetch posts with interactions data for the specific user
            const resultPosts = await db.query(`
                SELECT 
                    posts.*, 
                    COALESCE(SUM(post_interactions.likes), 0) AS total_likes,
                    COALESCE(SUM(post_interactions.dislikes), 0) AS total_dislikes
                FROM posts
                LEFT JOIN post_interactions ON posts.post_id = post_interactions.post_id
                WHERE posts.user_id = $1
                GROUP BY posts.post_id
            `, [userId]);

            const posts = resultPosts.rows;

            // Fetch answers for each post
            const postsWithAnswers = await Promise.all(
                posts.map(async (post) => {
                    const answers = await db.query(`
                        SELECT 
                            a.answer_title, 
                            a.answer_description, 
                            a.answer_date, 
                            up.name, 
                            up.profile_image
                        FROM Answer a
                        JOIN user_profiles up ON a.user_id = up.user_id
                        WHERE a.post_id = $1
                    `, [post.post_id]);

                    // Attach the answers to the post object
                    return {
                        ...post,
                        answers: answers.rows // Attach the answers to the post
                    };
                })
            );

            // Render the profile page with user profile data and posts with answers
            res.render('userprofile', { profile, posts: postsWithAnswers });
        } else {
            console.log("User Not found");
            res.render('userprofile', { profile: null, posts: [] });
        }
    } catch (err) {
        console.error("Error fetching profile:", err);
        res.status(500).send("Error fetching profile.");
    }
});



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
