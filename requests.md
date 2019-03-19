# Register user

POST: localhost:3000/register

{
	"email":"test",
	"username":"test",
	"password":"test",
	"password2":"test",
	"words": {
		"word": "test",
		"definition": "this is a test."
	}
}

# Log in

POST: localhost:3000/login

{
    "username": "test",
    "password": "test"
}

